import pandas as pd
import numpy as np
import statsmodels.api as sm
import nflreadpy as nfl
import statsmodels.formula.api as smf
from sklearn.model_selection import train_test_split
import warnings
import pickle
import os.path
import polars as pl

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)

MODEL_FILE = 'nfl_win_prob_model.pkl'

def load_and_prep_data():
    """
    Loads and preprocesses the NFL play-by-play data using Polars.
    """
    print("Loading Play-by-Play data (2010-2023)...")
    df = nfl.load_pbp(range(2010, 2024))
    print("Data loaded. Preprocessing...")

    columns = [
        'game_id', 'home_team', 'away_team', 'posteam', 'posteam_type', 
        'yardline_100', 'game_seconds_remaining', 'qtr', 'down', 'ydstogo', 
        'play_type', 'posteam_score', 'defteam_score', 'score_differential', 
        'season', 'away_score', 'home_score', 'result'
    ]
    
    existing_columns = [col for col in columns if col in df.columns]
    df_reduced = df.select(existing_columns)

    # Polars feature engineering
    df_reduced = df_reduced.with_columns([
        pl.when(pl.col('home_score') > pl.col('away_score'))
          .then(pl.col('home_team'))
          .otherwise(pl.col('away_team'))
          .alias('winner'),
    ]).with_columns([
        pl.when(pl.col('winner') == pl.col('posteam'))
          .then(pl.lit('Yes'))
          .otherwise(pl.lit('No'))
          .alias('poswins')
    ])

    # Polars cleaning
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
    data_pd = data_pl.to_pandas()
    train, _ = train_test_split(data_pd, test_size=0.2, random_state=123)
    formula = 'poswins ~ qtr + down + ydstogo + yardline_100 + score_differential + game_seconds_remaining'

    model = smf.glm(formula=formula, data=train, family=sm.families.Binomial())
    result = model.fit()
    
    print("Model training complete.")
    return result

def main():
    """
    Main function to train and save the model.
    """
    if os.path.exists(MODEL_FILE):
        print(f"Model file '{MODEL_FILE}' already exists. Skipping training.")
        return

    print("--- Model Not Found: Starting Training ---")
    pbp_data = load_and_prep_data()
    win_prob_model = train_win_probability_model(pbp_data)
    
    print(f"Saving model to {MODEL_FILE}...")
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump(win_prob_model, f)
    print("Model saved successfully.")

if __name__ == "__main__":
    main()