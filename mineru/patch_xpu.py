"""Patch MinerU's config_reader.py to add Intel XPU device detection.
This script patches the file directly without importing mineru, since it runs
before mineru's full dependency tree is available."""
import os
import sys

# Find config_reader.py in site-packages
import site
for site_path in site.getsitepackages():
    candidate = os.path.join(site_path, 'mineru', 'utils', 'config_reader.py')
    if os.path.exists(candidate):
        config_file = candidate
        break
else:
    # Try sys.path as fallback
    for p in sys.path:
        candidate = os.path.join(p, 'mineru', 'utils', 'config_reader.py')
        if os.path.exists(candidate):
            config_file = candidate
            break
    else:
        print("ERROR: could not find mineru/utils/config_reader.py")
        sys.exit(1)

with open(config_file) as f:
    content = f.read()

# Find the return "cpu" line and insert XPU check before it
cpu_return = '        return "cpu"'
xpu_insert = '''                    try:
                        import intel_extension_for_pytorch  # noqa: F401
                        if torch.xpu.is_available():
                            return "xpu"
                    except Exception:
                        pass
        return "cpu"'''

if cpu_return in content:
    content = content.replace(cpu_return, xpu_insert, 1)
    with open(config_file, 'w') as f:
        f.write(content)
    print(f"Patched {config_file}: added XPU device detection")
else:
    print(f"WARNING: could not find '{cpu_return}' in {config_file}")
    # Dump relevant lines for debugging
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'return "cpu"' in line:
            print(f"  Line {i}: {line}")
