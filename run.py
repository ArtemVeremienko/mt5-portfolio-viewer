import os
import sys
import webbrowser
import subprocess
import time

def check_environment():
    print("=" * 60)
    print("  MetaTrader 5 Portfolio Viewer (Myfxbook & Van Tharp SQN)")
    print("=" * 60)

    # Check if frontend is built
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")
    if not os.path.exists(dist_dir) or not os.path.exists(os.path.join(dist_dir, "index.html")):
        print("[!] Frontend dist not found. Building Solid.js frontend...")
        frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
        res = subprocess.run(["npm", "run", "build"], cwd=frontend_dir, shell=True)
        if res.returncode != 0:
            print("[X] Frontend build failed. Please run 'npm run build' inside frontend/")
            sys.exit(1)
        print("[✓] Frontend successfully built.")
    else:
        print("[✓] Production frontend dist found.")

def main():
    check_environment()
    port = 8000
    host = "127.0.0.1"
    url = f"http://localhost:{port}"

    print(f"\n[🚀] Starting unified server on {url}")
    print(f"[📊] Features: Live MT5 sync, SQLite persistence, Gain % & Van Tharp R-Multiple analytics")
    print("[💡] Press Ctrl+C to stop the server.\n")

    # Open browser automatically after a short delay
    def open_browser():
        time.sleep(1.2)
        webbrowser.open(url)

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Run uvicorn server
    import uvicorn
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)

if __name__ == "__main__":
    main()
