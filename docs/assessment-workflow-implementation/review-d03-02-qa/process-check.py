"""Read-only ownership check; print only QA-scoped test processes."""
import psutil
import json
found=[]
for p in psutil.process_iter(['pid','ppid','name']):
    try:
        args=p.cmdline()
        if p.info['name'].lower() in ('node.exe','chrome.exe','chrome-headless-shell.exe') and any('review-d03-02-qa' in a for a in args):
            found.append(dict(p.info,args=args))
    except (psutil.AccessDenied,psutil.NoSuchProcess):
        pass
print(json.dumps({'qa_owned_processes':found},indent=2))
