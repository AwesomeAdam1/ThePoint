from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import os
import uvicorn

app = FastAPI()

# Initialize OpenAI client
# openai.api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",  api_key="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",
)


class NumberInput(BaseModel):
    num1: float
    num2: float

@app.post("/add")
async def add_numbers(input: NumberInput):
    try:
        # Create the prompt
        prompt = f"Add these two numbers: {input.num1} + {input.num2}. Respond with only the numeric result."
        
        # # Call OpenAI API
        # response = openai.ChatCompletions.create(
        #     model="gpt-3.5-turbo",
        #     messages=[{"role": "user", "content": prompt}],
        #     temperature=0
        # )
        response = client.chat.completions.create(
            model="nvidia/nemotron-nano-9b-v2:free",
            messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                        ]
            )
            
        # Extract the result
        result = response.choices[0].message.content.strip()
        
        return {
            "num1": input.num1,
            "num2": input.num2,
            "result": result,
            "raw_response": response.choices[0].message.content
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# @app.get("/")
# async def root():
#     return {"message": "Send a POST request to /add with num1 and num2"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7777)