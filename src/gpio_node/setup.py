from setuptools import find_packages, setup

package_name = "gpio_node"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="developer",
    maintainer_email="dev@example.com",
    description="ROS2 GPIO node for Raspberry Pi",
    license="MIT",
    entry_points={
        "console_scripts": [
            "gpio_node = gpio_node.gpio_node:main",
        ],
    },
)
