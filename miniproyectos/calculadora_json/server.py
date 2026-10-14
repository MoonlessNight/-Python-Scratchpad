#!/usr/bin/env python3
"""Calculadora web local con evaluación segura de expresiones y persistencia JSON."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
import json, ast, math, operator, threading, os, sys

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
FILES = {
    "history": DATA / "history.json",
    "variables": DATA / "variables.json",
    "settings": DATA / "settings.json",
}
DEFAULTS = {
    "history": [],
    "variables": {},
    "settings": {
        "history_enabled": True,
        "variables_enabled": True,
        "sounds_enabled": True,
        "tutorial_seen": False,
        "theme": "system",
        "background": "",
        "font": "system",
        "sound_url": ""
    }
}
lock = threading.RLock()

def read_json(kind):
    path = FILES[kind]
    if not path.exists():
        write_json(kind, DEFAULTS[kind])
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return DEFAULTS[kind].copy()

def write_json(kind, value):
    # Escritura atómica para evitar dejar archivos JSON a medias.
    path = FILES[kind]
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

BIN_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod, ast.Pow: operator.pow
}
UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
FUNCS = {
    "sqrt": math.sqrt, "abs": abs, "round": round, "floor": math.floor,
    "ceil": math.ceil, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "log": math.log, "log10": math.log10, "exp": math.exp,
    "min": min, "max": max
}
CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}

class ExpressionError(ValueError):
    pass

def safe_eval(expression, variables):
    if not isinstance(expression, str) or not expression.strip():
        raise ExpressionError("Escribe una operación.")
    if len(expression) > 500:
        raise ExpressionError("La expresión supera el límite de 500 caracteres.")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        raise ExpressionError("No se pudo interpretar la expresión. Revisa la sintaxis.")
    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        if isinstance(node, ast.Name):
            if node.id in CONSTANTS: return CONSTANTS[node.id]
            if node.id in variables: return variables[node.id]
            raise ExpressionError(f"Variable o constante desconocida: {node.id}")
        if isinstance(node, ast.BinOp) and type(node.op) in BIN_OPS:
            a, b = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Pow) and abs(b) > 1000:
                raise ExpressionError("El exponente es demasiado grande.")
            result = BIN_OPS[type(node.op)](a, b)
            if isinstance(result, complex) or not math.isfinite(float(result)):
                raise ExpressionError("El resultado no es un número real finito.")
            return result
        if isinstance(node, ast.UnaryOp) and type(node.op) in UNARY_OPS:
            return UNARY_OPS[type(node.op)](visit(node.operand))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCS:
            if node.keywords:
                raise ExpressionError("No se admiten argumentos con nombre.")
            args = [visit(a) for a in node.args]
            return FUNCS[node.func.id](*args)
        raise ExpressionError("Elemento no permitido. Solo se admiten operaciones matemáticas y funciones disponibles.")
    try:
        result = visit(tree)
        if isinstance(result, bool) or not math.isfinite(float(result)):
            raise ExpressionError("El resultado no es un número finito.")
        return result
    except ZeroDivisionError:
        raise ExpressionError("No se puede dividir entre cero.")
    except (OverflowError, ValueError, TypeError) as exc:
        if isinstance(exc, ExpressionError): raise
        raise ExpressionError("Operación inválida o fuera de rango.")

def valid_name(name):
    return isinstance(name, str) and name.isidentifier() and not name.startswith("_") and name not in FUNCS and name not in CONSTANTS

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt, *args):
        # No registrar expresiones del usuario en consola.
        pass

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self';")
        self.end_headers()
        self.wfile.write(raw)

    def read_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 100_000: raise ValueError()
            return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            raise ValueError("Solicitud JSON inválida.")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            with lock:
                settings = read_json("settings")
                history = read_json("history") if settings.get("history_enabled", True) else []
                variables = read_json("variables") if settings.get("variables_enabled", True) else {}
            return self.send_json({"history": history, "variables": variables, "settings": settings})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_body()
            with lock:
                settings = read_json("settings")
                history = read_json("history")
                variables = read_json("variables")
                if path == "/api/calculate":
                    result = safe_eval(body.get("expression", ""), variables if settings.get("variables_enabled", True) else {})
                    entry = {"id": __import__("secrets").token_hex(6), "expression": body.get("expression", "").strip(),
                             "result": result, "created_at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds")}
                    if settings.get("history_enabled", True):
                        history.append(entry); history = history[-500:]; write_json("history", history)
                    return self.send_json({"ok": True, "entry": entry})
                if path == "/api/variable":
                    if not settings.get("variables_enabled", True): return self.send_json({"error":"Las variables están desactivadas."}, 403)
                    name = body.get("name", "")
                    if not valid_name(name): return self.send_json({"error":"Nombre inválido. Usa un identificador como total_1."}, 400)
                    if body.get("delete"):
                        if name not in variables: return self.send_json({"error":"Esa variable no existe."}, 404)
                        del variables[name]
                    else:
                        value = safe_eval(body.get("expression", ""), variables)
                        variables[name] = value
                    write_json("variables", variables)
                    return self.send_json({"ok": True, "variables": variables})
                if path == "/api/history":
                    if not settings.get("history_enabled", True): return self.send_json({"error":"El historial está desactivado."}, 403)
                    action = body.get("action")
                    if action == "clear":
                        history = []; write_json("history", history)
                    elif action == "delete":
                        history = [x for x in history if x.get("id") != body.get("id")]; write_json("history", history)
                    elif action == "edit":
                        target = next((x for x in history if x.get("id") == body.get("id")), None)
                        if not target: return self.send_json({"error":"Operación no encontrada."}, 404)
                        target["expression"] = str(body.get("expression", ""))[:500]
                        write_json("history", history)
                    else: return self.send_json({"error":"Acción de historial no reconocida."}, 400)
                    return self.send_json({"ok": True, "history": history})
                if path == "/api/settings":
                    allowed = {"history_enabled","variables_enabled","sounds_enabled","tutorial_seen","theme","background","font","sound_url"}
                    for key, value in body.items():
                        if key in allowed:
                            if key.endswith("_enabled") or key == "tutorial_seen":
                                settings[key] = bool(value)
                            elif key in {"theme","font"}:
                                settings[key] = str(value)[:40]
                            else:
                                settings[key] = str(value)[:1000]
                    write_json("settings", settings)
                    return self.send_json({"ok": True, "settings": settings})
            self.send_json({"error":"Ruta no encontrada."}, 404)
        except ExpressionError as e:
            self.send_json({"error":str(e)}, 400)
        except ValueError as e:
            self.send_json({"error":str(e)}, 400)
        except Exception:
            self.send_json({"error":"No se pudo completar la solicitud."}, 500)

def main():
    host = os.environ.get("CALC_HOST", "127.0.0.1")
    port = int(os.environ.get("CALC_PORT", "8765"))
    if host not in ("127.0.0.1", "localhost", "::1"):
        print("Por seguridad, el servidor solo escucha en localhost. No lo expongas directamente a Internet.")
        sys.exit(2)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Calculadora disponible en http://{host}:{port}")
    print("Detén el servidor con Ctrl+C. Los datos se guardan en ./data/*.json")
    try: server.serve_forever()
    except KeyboardInterrupt: print("\\nServidor detenido.")
    finally: server.server_close()

if __name__ == "__main__":
    main()
