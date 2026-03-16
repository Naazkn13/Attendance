"""Standalone script to trigger the session builder."""
import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()

from app.workers.session_builder import run_session_builder

async def main():
    print("Running session builder...")
    result = await run_session_builder()
    print(f"Result: {result}")

if __name__ == "__main__":
    asyncio.run(main())
