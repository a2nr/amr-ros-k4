"""Utility functions for the executor package."""


def parse_params(keys: list[str], values: list[str]) -> dict[str, str]:
    """
    Convert two parallel arrays into a dictionary.

    Args:
        keys: Parameter names.
        values: Parameter values (as strings).

    Returns:
        Dictionary mapping keys to values.

    Raises:
        ValueError: If keys and values have different lengths.
    """
    if len(keys) != len(values):
        raise ValueError(
            f"param_keys length ({len(keys)}) does not match "
            f"param_values length ({len(values)})"
        )
    return dict(zip(keys, values))
