#!/home/poa/xpenses_copy/venv/bin/python3
"""
setup_antigravity_agent.py
This script sets up and configures a Google Antigravity Agent using the SDK.
It equips the agent with safety policies, custom tools, and system instructions
for proper pair-programming in this Kotlin + Next.js repository.
"""

import sys
import asyncio
import subprocess
from google.antigravity import Agent, LocalAgentConfig, types, ToolContext
from google.antigravity.hooks import policy

# 1. Define custom tools for the agent to inspect the environment
def verify_project_environment() -> str:
    """Verifies the status of the local Docker development environment and active ports.
    
    Checks if Docker services are running, the Spring Boot backend is healthy, and the frontend is up.
    """
    results = []
    
    # Check Docker Compose status
    try:
        docker_ps = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True, text=True, check=True
        )
        results.append("### Docker Compose Status:\n" + docker_ps.stdout)
    except Exception as e:
        results.append(f"### Docker Compose check failed: {e}")
        
    # Check backend health
    try:
        backend_check = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:8001/api/health"],
            capture_output=True, text=True, timeout=5
        )
        status = backend_check.stdout.strip()
        results.append(f"### Kotlin Backend Health (port 8001): HTTP {status} (Expected: 200)")
    except Exception as e:
        results.append(f"### Kotlin Backend check failed: {e}")

    # Check frontend status
    try:
        frontend_check = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:3001"],
            capture_output=True, text=True, timeout=5
        )
        status = frontend_check.stdout.strip()
        results.append(f"### Next.js Frontend Status (port 3001): HTTP {status} (Expected: 200 or 307/302/200)")
    except Exception as e:
        results.append(f"### Next.js Frontend check failed: {e}")
        
    return "\n\n".join(results)

# 2. Setup the configuration
config = LocalAgentConfig(
    # Set the model (defaults to gemini-3.5-flash)
    model="gemini-3.5-flash",
    
    # Equipping the agent with the custom env verification tool
    tools=[verify_project_environment],
    
    # Custom safety policies
    policies=[
        # Protect against accidental data loss or destructive commands
        policy.deny(
            "run_command",
            when=lambda args: any(cmd in args.get("CommandLine", "") for cmd in ["rm -rf", "git reset --hard", "dropdb", "delete"]),
            name="deny_destructive_commands"
        ),
        # Default safety: ask user for confirmation before executing commands
        policy.confirm_run_command(),
    ],
    
    # Set up system instructions defining the pair programming persona and token optimization
    system_instructions=(
        "You are a Senior Kotlin & React Pair-Programmer agent. You help the user build "
        "and refactor the 'xpenses-kotlin' application.\n\n"
        "Core directives:\n"
        "1. Prioritize Kotlin Spring Boot 3.4.3 & JPA best practices for backend.\n"
        "2. Prioritize Next.js 15, React 19, and Tailwind CSS v4 for frontend.\n"
        "3. Keep code modular, type-safe, and clean.\n"
        "4. Avoid suggesting full Docker container rebuilds unless dependencies in build.gradle.kts or package.json change.\n"
        "5. Advise running standard JVM execution (bootJar) for rapid local iteration."
    )
)

async def main():
    print("Initializing Antigravity coding agent...")
    
    async with Agent(config) as agent:
        # Prompt the agent to run the custom tool and verify setup
        print("\n--- Running initial project diagnostics with custom tool ---")
        response = await agent.chat("Please verify the project environment using the verify_project_environment tool and summarize what is active.")
        
        async for chunk in response:
            print(chunk, end="", flush=True)
        print("\n------------------------------------------------------------\n")
        
        # Launching the interactive shell loop for the user
        print("Starting interactive developer chat loop (type 'exit' or 'quit' to stop):")
        await agent.run_interactive_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting agent session.")
        sys.exit(0)
