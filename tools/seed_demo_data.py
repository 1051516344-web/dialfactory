"""DialFactory V1 · Demo Data Seeder"""
import urllib.request, json, sys

BASE = "https://wzfkmwrqnvjegunjueka.supabase.co"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmttd3JxbnZqZWd1bmp1ZWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODExNTksImV4cCI6MjEwMTU1NzE1OX0.Y8IVY-epnh_0gBpumzyDSy6W8mEtVX8mrwd4ExngL2M"

def api(method, table, data=None, select="*"):
    url = f"{BASE}/rest/v1/{table}"
    if select and method == "GET":
        url += f"?select={select}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("apikey", ANON)
    req.add_header("Authorization", f"Bearer {ANON}")
    if data:
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=representation")
    try:
        resp = urllib.request.urlopen(req)
        text = resp.read().decode()
        return json.loads(text) if text else []
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return None

# --- Departments ---
deps = api("GET", "departments")
dept_map = {d['name']: d['id'] for d in deps}
print(f"Departments: {len(deps)}")

# --- Customer ---
cust = api("POST", "customers", {"name": "深圳时诺钟表有限公司", "code": "SN", "is_active": True})
cid = cust[0]['id'] if isinstance(cust, list) else cust['id']
print(f"Customer: SN → {cid[:8]}...")

# --- Processes ---
procs = [
    ("P01", "冲压成型", "加工", "制一", True),
    ("P03", "太阳纹加工", "加工", "制二", False),
    ("P05", "银白电镀", "加工", "制三", False),
    ("P07", "移印", "加工", "制四", False),
    ("P09", "总QC检验", "检验", "总QC", True),
]
proc_map = {}
for code, name, ptype, dept_name, required in procs:
    r = api("POST", "processes", {
        "code": code, "name": name, "type": ptype,
        "default_dept_id": dept_map[dept_name],
        "is_required": required, "is_active": True
    })
    pid = r[0]['id'] if isinstance(r, list) else r['id']
    proc_map[code] = pid
    print(f"  {code}: {name} → {pid[:8]}...")

# --- Route ---
r = api("POST", "process_routes", {"name": "标准太阳纹+银白路线", "is_active": True})
route_id = r[0]['id'] if isinstance(r, list) else r['id']
print(f"Route: {route_id[:8]}...")

# --- Route Steps ---
for seq, code in enumerate(["P01", "P03", "P05", "P07", "P09"], 1):
    api("POST", "route_steps", {"route_id": route_id, "process_id": proc_map[code], "seq": seq})
    print(f"  Step {seq}: {code}")

# --- Verify ---
print(f"\nFinal State:")
for t in ["customers", "processes", "process_routes", "route_steps", "orders", "order_nodes", "exception_events"]:
    rows = api("GET", t)
    print(f"  {t}: {len(rows)} rows")
