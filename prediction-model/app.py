import pandas as pd
import numpy as np
import statsmodels.api as sm
import nflreadpy as nfl
import statsmodels.formula.api as smf
from sklearn.model_selection import train_test_split
import warnings
import pickle
import os.path
import polars as pl  # <-- Import Polars

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=pd.errors.SettingWithCopyWarning)

def load_and_prep_data():
    """
    Loads and preprocesses the NFL play-by-play data using Polars.
    """
    print("Loading Play-by-Play data (2010-2023)...")
    print("This may take a few minutes on the first run as it loads and caches data.")
    
    # nflreadpy returns a Polars DataFrame
    df = nfl.load_pbp(range(2010, 2024))
    print("Data loaded. Preprocessing...")

    # Select relevant columns (from cell 5)
    columns = [
        'game_id', 'home_team', 'away_team', 'posteam', 'posteam_type', 
        'yardline_100', 'game_seconds_remaining', 'qtr', 'down', 'ydstogo', 
        'play_type', 'posteam_score', 'defteam_score', 'score_differential', 
        'season', 'away_score', 'home_score', 'result'
    ]
    
    existing_columns = [col for col in columns if col in df.columns]
    
    # --- Polars equivalent of selection ---
    df_reduced = df.select(existing_columns)

    # --- Polars equivalent of cell 6 (Feature Engineering) ---
    df_reduced = df_reduced.with_columns([
        # 1. Create 'winner' column
        pl.when(pl.col('home_score') > pl.col('away_score'))
          .then(pl.col('home_team'))
          .otherwise(pl.col('away_team'))
          .alias('winner'),
    ]).with_columns([
        # 2. Create 'poswins' column (depends on 'winner')
        pl.when(pl.col('winner') == pl.col('posteam'))
          .then(pl.lit('Yes'))
          .otherwise(pl.lit('No'))
          .alias('poswins')
    ])

    # --- Polars equivalent of cell 7 (Cleaning) ---
    df_reduced = df_reduced.filter(
        (pl.col('play_type') != "no_play") & 
        (pl.col('play_type').is_not_null()) &
        (pl.col('qtr') <= 4)
    )
    df_reduced = df_reduced.drop_nulls(subset=[
        'down', 'score_differential', 'yardline_100', 'game_seconds_remaining'
    ])
    
    print("Preprocessing complete.")
    return df_reduced

def train_win_probability_model(data_pl: pl.DataFrame):
    """
    Trains the GLM Binomial model.
    Converts Polars DataFrame to Pandas for statsmodels compatibility.
    """
    print("Training win probability model...")

    # Convert to Pandas for scikit-learn and statsmodels
    data_pd = data_pl.to_pandas()

    # Split data into training and testing (from cell 8)
    train, _ = train_test_split(data_pd, test_size=0.2, random_state=123)

    # Define the formula (from cell 9)
    formula = 'poswins ~ qtr + down + ydstogo + yardline_100 + score_differential + game_seconds_remaining'

    # Fit the model (from cell 10)
    model = smf.glm(formula=formula, data=train, family=sm.families.Binomial())
    result = model.fit()
    
    print("Model training complete.")
    return result

def get_scenario_input():
    """
    Prompts the user to enter the 6 features required by the model.
    Returns a Polars DataFrame formatted for prediction.
    """
    print("\n--- Enter Scenario for the Possession Team ---")
    print("(Enter 'quit' at any time to exit)")

    try:
        def get_input(prompt, cast_type):
            val = input(prompt)
            if val.lower() == 'quit':
                raise KeyboardInterrupt
            return cast_type(val)

        qtr = get_input("Quarter (1-4): ", int)
        down = get_input("Down (1.0-4.0): ", float)
        ydstogo = get_input("Yards to Go (e.g., 10): ", int)
        yardline_100 = get_input("Yard Line (1-99, distance from opponent's endzone): ", int)
        score_differential = get_input("Score Differential (Possession Team Score - Opponent's Score): ", int)
        game_seconds_remaining = get_input("Game Seconds Remaining (0-3600): ", int)
        
        if qtr not in [1, 2, 3, 4] or down not in [1.0, 2.0, 3.0, 4.0] or not (0 < yardline_100 < 100):
            print("\nInvalid input. Please check your values and try again.")
            return None

        # Create a dictionary to build the Polars DataFrame
        data = {
            'qtr': [qtr],
            'down': [down],
            'ydstogo': [ydstogo],
            'yardline_100': [yardline_100],
            'score_differential': [score_differential],
            'game_seconds_remaining': [game_seconds_remaining]
        }
        # --- Create Polars DataFrame ---
        return pl.DataFrame(data)
        
    except ValueError:
        print("\nInvalid input. Please enter numbers only.")
        return None
    except KeyboardInterrupt:
        return "quit"

def predict_win_chance(model_result, scenario_df_pl: pl.DataFrame):
    """
    Predicts the win probability for the given scenario.
    Converts the single-row Polars DataFrame to Pandas for prediction.
    """
    # --- Convert to Pandas for .predict() ---
    scenario_df_pd = scenario_df_pl.to_pandas()
    
    prob_lose = model_result.predict(scenario_df_pd).iloc[0]
    prob_win = 1.0 - prob_lose
    return prob_win

def main():
    """
    Main function to run the program.
    Checks for a cached model before training.
    """
    MODEL_FILE = 'nfl_win_prob_model.pkl'

    if os.path.exists(MODEL_FILE):
        print(f"Loading cached model from {MODEL_FILE}...")
        with open(MODEL_FILE, 'rb') as f:
            win_prob_model = pickle.load(f)
        print("Cached model loaded.")
    
    else:
        # pbp_data is now a Polars DataFrame
        pbp_data = load_and_prep_data()
        win_prob_model = train_win_probability_model(pbp_data)
        
        print(f"Saving model to {MODEL_FILE} for future use...")
        with open(MODEL_FILE, 'wb') as f:
            pickle.dump(win_prob_model, f)
        print("Model saved.")

    print("\n--- NFL Win Probability Calculator Ready ---")
    
    while True:
        # scenario is a Polars DataFrame
        scenario = get_scenario_input()
        
        if scenario is None:
            continue
        if isinstance(scenario, str) and scenario == "quit":
            print("\nExiting program.")
            break
            
        win_probability = predict_win_chance(win_prob_model, scenario)
        
        print("-------------------------------------------------")
        print(f"  Possession Team Win Probability: {win_probability * 100:.2f}%")
        print("-------------------------------------------------")

if __name__ == "__main__":
    main()