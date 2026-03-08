import os
from setuptools import setup, find_packages

package_name = "blockly_app"


def collect_ui_files(base_dir="blockly_app/ui"):
    """Collect all UI files as package_data globs."""
    patterns = []
    for root, dirs, files in os.walk(base_dir):
        # Convert filesystem path to package-relative path
        rel_root = os.path.relpath(root, "blockly_app")
        for f in files:
            patterns.append(os.path.join(rel_root, f))
    return patterns


setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    package_data={
        package_name: collect_ui_files(),
    },
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools"],
    entry_points={
        "console_scripts": [
            "blockly_app = blockly_app.app:main",
        ],
    },
)
