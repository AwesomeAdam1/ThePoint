import os
import json
from google import genai
from google.genai import types  # Import types for the config
from dotenv import load_dotenv

# Load the .env file to get the key
load_dotenv()

# This is the "brain" of your agent.
SYSTEM_PROMPT = """
You are a 'Football Scenario Generator' for a live sports data system.
Your job is to take a single, current game state and return a list of the 3-4 most critical, plausible outcomes of the *next* play.

RULES:
1.  Format: You MUST return ONLY a valid JSON object matching the requested schema. The root must be a JSON object with a key "scenarios", which contains a list of scenario objects. Do not add any explanatory text.
2.  Content: Each object in the list must represent a *future* game state.
3.  State Keys: Each state object MUST contain these keys: `scenario_name`, `quarter`, `down`, `yards_to_go`, `yard_line`, `score_differential`, `game_seconds_remaining`, `possession_team`.
4.  Logic (Turnover): If a turnover happens, you MUST flip `possession_team` and adjust `yard_line` and `score_differential` from the *new* team's perspective.
5.  Logic (Time): You must estimate a reasonable time deduction for each play. For a game-ending play, set `game_seconds_remaining` to 0.
6.  Logic (Downs): On 4th down, your scenarios should be "Go for it (Success)", "Go for it (Fail)", and "Punt" or "Field Goal" (if in range). On other downs, they should be "Big Play", "Short Play / Failed Play", and "Turnover".
"""

# --- 1. Initialize Client ---
try:
    api_key = os.environ["GOOGLE_API_KEY"]
    client = genai.Client(api_key=api_key)
except KeyError:
    print("Error: GOOGLE_API_KEY not found. Did you create a .env file?")
    exit()
except Exception as e:
    print(f"Error initializing client: {e}")
    exit()

# --- 2. Define the Generation Config ---
# System prompt, JSON mode, and temperature all go here.
generation_config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    response_mime_type="application/json",
    temperature=0.2
)

def generate_scenarios(current_state_dict: dict) -> list:
    """
    Takes a dictionary of the current game state and returns a 
    list of plausible future state dictionaries.
    """
    
    # Format the current state into a clean prompt for the user
    try:
        user_prompt = f"Current State:\n{json.dumps(current_state_dict, indent=2)}\n\nGenerate the scenarios as a JSON object with a single key 'scenarios'."
    except Exception as e:
        print(f"Error formatting current state: {e}")
        return []

    print("--- Calling Gemini Reasoning Agent (google-genai) ---")
    
    try:
        # --- 3. Call the API Correctly ---
        response = client.models.generate_content(
            model="gemini-2.0-flash-001", # Pass model name as a string
            contents=user_prompt,            # The user's prompt
            config=generation_config         # The config object with all rules
        )
        
        # Get the response text and parse it
        response_content = response.text
        scenarios_object = json.loads(response_content)
        
        # Extract the list from the "scenarios" key
        if isinstance(scenarios_object, dict) and "scenarios" in scenarios_object:
            return scenarios_object["scenarios"]
        else:
            print(f"Error: LLM returned unexpected JSON structure: {scenarios_object}")
            return []

    except Exception as e:
        print(f"Error calling LLM or parsing JSON: {e}")
        return []

# --- This block lets you test the file directly ---
if __name__ == "__main__":
    
    # Our "Game-Winning Field Goal" test case
    test_state_fg = {
      "possession_team": "Team A",
      "opponent_team": "Team B",
      "quarter": 4,
      "down": 4,
      "yards_to_go": 10,
      "yard_line": 28,  # At the opponent's 28-yard line
      "score_differential": -2, # Losing by 2
      "game_seconds_remaining": 3
    }
    
    scenarios = generate_scenarios(test_state_fg)
    
    print(f"\n--- Agent Returned {len(scenarios)} Scenarios ---")
    
    for i, scenario in enumerate(scenarios):
        print(f"\nScenario {i+1}: {scenario.get('scenario_name')}")
        print(json.dumps(scenario, indent=2))