"""
Utility functions for managing bd-econ chart data and manifest.

Usage:
    from chart_utils import publish_chart

    config = {
        'id': 'unemployment_rate',
        'type': 'area',
        'title': 'Unemployment Rate',
        'subtitle': 'Percent',
        'source': 'BLS',
        'color': 'red',
        'dateFormat': 'monthly',
        'beginAtZero': True
    }

    df = your_data_fetching_code()
    publish_chart(df, config)
"""
import json
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

# Path configuration - adjust to your setup
SITE_ROOT = Path(__file__).parent.parent
FILES_DIR = SITE_ROOT / 'files'
MANIFEST_PATH = FILES_DIR / 'charts.json'


def load_manifest():
    """Load the charts manifest, creating if it doesn't exist."""
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, 'r') as f:
            return json.load(f)
    else:
        return {
            "version": "1.0",
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "charts": []
        }


def save_manifest(manifest):
    """Save the manifest with updated timestamp."""
    manifest['lastUpdated'] = datetime.now(timezone.utc).isoformat()
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest saved: {MANIFEST_PATH}")


def save_chart_data(df, chart_id, date_col='date', value_col='value'):
    """
    Save DataFrame as CSV in the expected format.

    Parameters
    ----------
    df : pandas.DataFrame
        Data with date and value columns
    chart_id : str
        Unique chart identifier (used for filename)
    date_col : str
        Name of the date column in df
    value_col : str
        Name of the value column in df

    Returns
    -------
    str
        Relative path to the saved file (e.g., 'files/m2gdp.csv')
    """
    # Ensure proper format
    output_df = pd.DataFrame({
        'date': pd.to_datetime(df[date_col]).dt.strftime('%Y-%m-%d'),
        'value': df[value_col]
    })

    # Save CSV
    filepath = FILES_DIR / f'{chart_id}.csv'
    output_df.to_csv(filepath, index=False)
    print(f"Data saved: {filepath}")

    return f'files/{chart_id}.csv'


def register_chart(chart_config):
    """
    Add or update a chart in the manifest.

    Parameters
    ----------
    chart_config : dict
        Chart configuration with at least 'id', 'file', 'type', 'title', 'source'

    Returns
    -------
    dict
        The updated manifest
    """
    required_fields = ['id', 'file', 'type', 'title', 'source']
    for field in required_fields:
        if field not in chart_config:
            raise ValueError(f"Missing required field: {field}")

    manifest = load_manifest()

    # Find existing chart with same ID
    existing_idx = None
    for i, chart in enumerate(manifest['charts']):
        if chart['id'] == chart_config['id']:
            existing_idx = i
            break

    if existing_idx is not None:
        # Update existing
        manifest['charts'][existing_idx] = chart_config
        print(f"Updated chart: {chart_config['id']}")
    else:
        # Add new
        manifest['charts'].append(chart_config)
        print(f"Added new chart: {chart_config['id']}")

    save_manifest(manifest)
    return manifest


def publish_chart(df, config, date_col='date', value_col='value'):
    """
    Convenience function: save data and register chart in one call.

    Parameters
    ----------
    df : pandas.DataFrame
        Data to save
    config : dict
        Chart configuration. Required fields: 'id', 'type', 'title', 'source'.
        The 'file' field will be auto-generated based on 'id' if not provided.
    date_col : str
        Name of date column in df
    value_col : str
        Name of value column in df

    Returns
    -------
    dict
        The chart configuration as registered

    Example
    -------
    >>> config = {
    ...     'id': 'unemployment_rate',
    ...     'type': 'area',
    ...     'title': 'Unemployment Rate',
    ...     'subtitle': 'Percent, seasonally adjusted',
    ...     'source': 'Bureau of Labor Statistics',
    ...     'tooltipLabel': 'Rate',
    ...     'decimals': 1,
    ...     'color': 'red',
    ...     'dateFormat': 'monthly',
    ...     'beginAtZero': True,
    ...     'category': 'Labor',
    ...     'order': 10
    ... }
    >>> publish_chart(df, config)
    """
    # Save data
    file_path = save_chart_data(df, config['id'], date_col, value_col)

    # Ensure file path is set
    config = config.copy()  # Don't mutate original
    config['file'] = file_path

    # Register chart
    register_chart(config)

    print(f"Chart published: https://www.bd-econ.com/plots.html#{config['id']}")

    return config
