from setuptools import setup, find_packages

package_name = "executor"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(),
    install_requires=["setuptools"],
    entry_points={
        "console_scripts": [
            "executor_node = executor.executor_node:main",
        ],
    },
)
