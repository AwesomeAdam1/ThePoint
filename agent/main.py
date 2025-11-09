import os
import json
from fastapi import FastAPI
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

# --- 1. Load Config & API Keys ---
load_dotenv()

# --- 2. Pydantic Model (Your API's Input) ---
# This defines the "shape" of the JSON your API will accept.
# It gives you automatic data validation.
class GameState(BaseModel):
    possession_team: str
    opponent_team: str
    quarter: int
    down: int
    yards_to_go: int
    yard_line: int
    score_differential: int
    game_seconds_remaining: int
    
    # Add an example for the FastAPI /docs page
    class Config:
        json_schema_extra = {
            "example": {
                "possession_team": "Team A",
                "opponent_team": "Team B",
                "quarter": 4,
                "down": 4,
                "yards_to_go": 10,
                "yard_line": 28,
                "score_differential": -2,
                "game_seconds_remaining": 3
            }
        }

# --- 3. The Agent's "Brain" (System Prompt) ---
SYSTEM_PROMPT = """
You are a 'Football Scenario Generator' for a live sports data system.
Your job is to take a single, current game state and return a list of the 3-4 most critical, plausible outcomes of the *next* play. MAKE SURE to Include an attempted and failed field goal as a scenario

RULES:
1.  Format: You MUST return ONLY a valid JSON object matching the requested schema. The root must be a JSON object with a key "scenarios", which contains a list of scenario objects. Do not add any explanatory text.
2.  Content: Each object in the list must represent a *future* game state. Make sure all of the values are valid and within the expected range. Pay close attention to the possession_team and score_differential values, if the scenario is beneficial to the possession_team, the score_differential should accurately reflect the difference in score, and vice versa.
3.  State Keys: Each state object MUST contain these keys: `scenario_name`, `quarter`, `down`, `yards_to_go`, `yard_line`, `score_differential`, `game_seconds_remaining`, `possession_team`.
4.  Logic (Turnover): If a turnover happens, you MUST flip `possession_team` and adjust `yard_line` and `score_differential` from the *new* team's perspective.
5.  Logic (Time): You must estimate a reasonable time deduction for each play. For a game-ending play, set `game_seconds_remaining` to 0.
6.  Logic (Downs): On 4th down, your scenarios should be "Go for it (Success)", "Go for it (Fail)", and "Punt" or "Field Goal" (if in range). On other downs, they should be "Big Play", "Short Play / Failed Play", and "Turnover".
"""

# --- 4. Initialize Gemini Client & Config ---
try:
    api_key = os.environ["GOOGLE_API_KEY"]
    client = genai.Client(api_key=api_key)
except KeyError:
    print("Error: GOOGLE_API_KEY not found. Did you create a .env file?")
    exit()
except Exception as e:
    print(f"Error initializing client: {e}")
    exit()

generation_config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    response_mime_type="application/json",
    temperature=0.2
)

# --- 5. Refactored Async Agent Function ---
# We make this an 'async' function to use the async Gemini call
async def generate_scenarios_async(current_state_dict: dict) -> list:
    """
    Takes a state dictionary and calls the Gemini API asynchronously.
    """
    try:
        user_prompt = f"Current State:\n{json.dumps(current_state_dict, indent=2)}\n\nGenerate the scenarios as a JSON object with a single key 'scenarios'."
    except Exception as e:
        print(f"Error formatting current state: {e}")
        return []

    print("--- Calling Gemini Reasoning Agent (Async) ---")
    
    try:
        # ** KEY CHANGE: Use the .generate_content_async call **
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-001",
            contents=user_prompt,
            config=generation_config
        )
        
        response_content = response.text
        scenarios_object = json.loads(response_content)
        
        if isinstance(scenarios_object, dict) and "scenarios" in scenarios_object:
            return scenarios_object["scenarios"]
        else:
            print(f"Error: LLM returned unexpected JSON structure: {scenarios_object}")
            return []

    except Exception as e:
        print(f"Error calling LLM or parsing JSON: {e}")
        return []

# --- 6. Initialize FastAPI App ---
app = FastAPI(
    title="🏈 Crucial Moment Scenario Agent",
    description="An API that takes a live football game state and returns 'what-if' scenarios.",
    version="1.0.0"
)

# --- 7. Define Your API Endpoint ---
@app.post("/generate-scenarios")
async def api_generate_scenarios(state: GameState):
    """
    Receives a `GameState` JSON object, generates scenarios, and returns them.
    """
    # Convert Pydantic model to a plain dictionary for the agent
    state_dict = state.model_dump()
    
    # Call our async agent function and wait for the result
    scenarios = await generate_scenarios_async(state_dict)
    
    # Return the scenarios
    return {"scenarios": scenarios}

# --- 8. Add a simple health check endpoint ---
@app.get("/")
def get_root():
    return {"status": "Agent is running"}