import pandas as pd
import polars as pl
import pickle
import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

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
        return {
            "possession_team_win_probability": probability,
            "possession_team_win_percentage": f"{probability * 100:.2f}%"
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