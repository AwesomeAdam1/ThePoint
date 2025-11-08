import pandas as pd
import polars as pl
import pickle
import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import math

def get_corrected_wp(wp_from_model, game_state):
    
    quarter = game_state.qtr
    seconds = game_state.game_seconds_remaining
    score_diff = game_state.score_differential

    # Only apply correction in the 4th quarter
    if quarter != 4 or seconds > 300: # 5 mins
        return wp_from_model

    # --- Create the "Desperation" Factor ---
    # This number (N) gets bigger as time runs out
    # We add 1 to avoid dividing by zero
    # We use abs(score_diff) because "desperation" is high
    # whether you're up by 3 or down by 3.
    
    # Start with a base of 1 (no change)
    N = 1.0 
    
    # Add a "time_pressure" component
    # This value explodes as seconds -> 0
    time_pressure = 100 / (seconds + 1) # Arbitrary 100, tune as needed
    
    # Add a "score_pressure" component
    score_pressure = abs(score_diff) / 7 # Scaled by one TD
    
    # Combine them.
    N = 1.0 + (time_pressure * score_pressure * 0.5) # Tune this 0.5
    
    # N is now a number like 1.1 (early 4th) or 5.0 (late 4th)

    # --- Apply the "Squash" ---
    if score_diff > 0:
        # WINNING: Push WP closer to 1.
        # 0.80 ^ (1/3) = 0.92 (more confident)
        corrected_wp = wp_from_model ** (1 / N)
    elif score_diff < 0:
        # LOSING: Push WP closer to 0.
        # 0.20 ^ 3 = 0.008 (less confident)
        corrected_wp = wp_from_model ** N
    else:
        # TIED: The model is probably fine.
        corrected_wp = wp_from_model

    return corrected_wp
# --- Pydantic Model for Input Validation ---
# This defines the structure of the JSON your API will expect.
class Scenario(BaseModel):
    qtr: int = Field(..., example=4, description="Quarter (1-4)")
    down: float = Field(..., example=2.0, description="Down (1.0, 2.0, 3.0, or 4.0)")
    ydstogo: int = Field(..., example=10, description="Yards to go for a first down")
    yardline_100: int = Field(..., example=25, description="Distance from opponent's endzone (1-99)")
    score_differential: int = Field(..., example=-3, description="Possession Team Score - Opponent's Score")
    game_seconds_remaining: int = Field(..., example=120, description="Game Seconds Remaining (0-3600)")

# --- Load Model ---
MODEL_FILE = 'nfl_win_prob_model.pkl'

if not os.path.exists(MODEL_FILE):
    print(f"Error: Model file '{MODEL_FILE}' not found.")
    print("Please run 'python train.py' first to train and save the model.")
    exit()

with open(MODEL_FILE, 'rb') as f:
    win_prob_model = pickle.load(f)

print("Win probability model loaded successfully.")

# --- Prediction Function ---
def predict_win_chance(model_result, scenario: Scenario):
    """
    Predicts the win probability for the given scenario.
    """
    # Convert Pydantic model to a Polars DataFrame, then to Pandas
    data_dict = scenario.model_dump()
    scenario_df_pl = pl.DataFrame([data_dict])
    scenario_df_pd = scenario_df_pl.to_pandas()
    
    # Predict returns the probability of the first category ('No')
    prob_lose = model_result.predict(scenario_df_pd).iloc[0]
    
    # The probability of winning ('Yes') is 1 minus the probability of losing
    prob_win = 1.0 - prob_lose
    return prob_win

# --- Create FastAPI App ---
app = FastAPI(
    title="NFL Win Probability API",
    description="Calculates the win probability for the team with possession given a game scenario.",
    version="1.0"
)

# --- Define API Endpoint ---
@app.post("/predict")
async def predict_scenario(scenario: Scenario):
    """
    Accepts a game scenario via POST request and returns the 
    possession team's win probability.
    """
    try:
        probability = predict_win_chance(win_prob_model, scenario)
        corr = get_corrected_wp(probability, scenario)
        return {
            "possession_team_win_probability": corr,
            "possession_team_win_percentage": f"{corr * 100:.2f}%"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "NFL Win Probability API. Go to /docs for details."}

# --- Run the server (if run directly) ---
if __name__ == "__main__":
    print("--- To run this app with HTTPS, use the uvicorn command: ---")
    print("uvicorn app:app --reload --ssl-keyfile key.pem --ssl-certfile cert.pem --host 0.0.0.0 --port 8000")
    print("\n--- Starting in standard HTTP mode for simple testing... ---")
    uvicorn.run(app, host="127.0.0.1", port=8000)