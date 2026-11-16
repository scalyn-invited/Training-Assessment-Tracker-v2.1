import psutil,json
rows=[]
for p in psutil.process_iter(['pid','ppid','name','cmdline','create_time']):
 try:
  d=p.info; cmd=' '.join(d.get('cmdline') or [])
  if d['name'].lower()=='node.exe' and any(s in cmd for s in ['vitest','independent-qa']):
   rows.append({'pid':d['pid'],'ppid':d['ppid'],'command':cmd,'created':d['create_time'],'cpu':list(p.cpu_times()),'children':[{'pid':c.pid,'command':' '.join(c.cmdline()),'cpu':list(c.cpu_times())} for c in p.children(recursive=True)]})
 except (psutil.NoSuchProcess,psutil.AccessDenied):pass
print(json.dumps(rows,indent=2))
