# Guide: Adding a New ROS2 Package

## 10. Guide: Adding a New ROS2 Package

Every new `ament_python` package under `src/` must follow this structure:

```
src/<package_name>/
├── package.xml
├── readme.md
├── setup.py
├── setup.cfg
├── resource/
│   └── <package_name>          # Empty file — ament index marker
├── <package_name>/             # Python module — same name as package
│   ├── __init__.py
│   └── <your_node>.py
└── test/
    ├── __init__.py
    └── test_<feature>.py
```

**setup.cfg:**
```ini
[develop]
script_dir=$base/lib/<package_name>
[install]
install_scripts=$base/lib/<package_name>
```

**package.xml:**
```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd"
            schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>PACKAGE_NAME</name>
  <version>0.1.0</version>
  <description>DESCRIPTION</description>
  <maintainer email="dev@example.com">developer</maintainer>
  <license>MIT</license>
  <depend>rclpy</depend>
  <test_depend>pytest</test_depend>
  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
```

**setup.py:**
```python
from setuptools import setup, find_packages

package_name = "PACKAGE_NAME"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools"],
    entry_points={
        "console_scripts": [
            "node_name = PACKAGE_NAME.module:main",
        ],
    },
)
```

**Steps:**
1. `mkdir -p src/<package_name>/<package_name>`
2. Create `package.xml`, `setup.py`, `setup.cfg` from templates above
3. `touch src/<package_name>/resource/<package_name>`
4. Add `__init__.py` and node files
5. Add build/run tasks to `pixi.toml`
6. `colcon build --symlink-install --packages-select <package_name>`

---
