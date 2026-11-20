"""Read only check for correction-owned test processes."""
import psutil
import json
for p in psutil.process_iter(['pid', 'ppid', 'name']):
    try:
        args=p.cmdline()
        if p.info['name'].lower() in ('node.exe','chrome.exe','chrome-headless-shell.exe') and any('review-d03-02-correction' in a for a in args):
            print(json.dumps(dict(p.info, args=args)))
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        pass
