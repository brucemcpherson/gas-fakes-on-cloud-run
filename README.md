# gas-fakes-on-cloud-run

This repository demonstrates how to execute Google Apps Script code locally using Node.js to bypass the standard Apps Script IDE runtime limit of 6 minutes.

## Overview

Complex or data-intensive Apps Script projects often hit the 6-minute execution limit. This proof-of-concept shows how you can take your existing Apps Script logic and run it in a Node.js environment using the `@mcpher/gas-fakes` library. This library provides emulation for standard Apps Script services (like `DriveApp`, `SpreadsheetApp`, etc.), allowing your code to run anywhere Node.js is supported—with no time limits.

### Key Benefits
- **Bypass Runtime Limits**: Run scripts for as long as needed.
- **Local Development**: Use your favorite IDE, version control, and testing tools.
- **Scalability**: Prepare for containerization and deployment to services like Google Cloud Run.

## Example Use Case: Drive Duplicate Finder

The included `example.js` script performs a deep scan of your Google Drive to identify duplicate files based on their MD5 checksums. For accounts with many files, this process can easily exceed the 6-minute Apps Script limit.

The script:
1.  Enumerates all folders you own.
2.  Traverses all files (excluding Google Workspace files which lack MD5 hashes).
3.  Calculates paths and identifies duplicates.
4.  Outputs the results to a Google Sheet, highlighting groups of duplicates in different colors.

## Prerequisites

- **Node.js**: Installed on your local machine.
- **Google Cloud Project**: A project with the Drive and Sheets APIs enabled.
- **Service Account / Credentials**: Setup for authentication (managed via `gasfakes.json` and `.env`).

## Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/brucemcpherson/gas-fakes-on-cloud-run.git
    cd gas-fakes-on-cloud-run
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure your environment:
    - Configure any necessary environment variables in `.env`. (you can use `gas-fakes init` to create a .env file)
    - Authenticate to google workspace using `gas-fakes auth`

    For more information on how to authenticate and use gas-fakes cli, see the [gas-fakes](https://github.com/brucemcpherson/gas-fakes) documentation.

## Running the Script

To run the duplicate finder locally:

```bash
node example.js
```

The script uses `LibHandlerApp.load()` to load libraries defined in your project manifest, ensuring compatibility with your existing Apps Script environment. gas-fakes is able to use apps script libraries directly from the project manifest. This example uses [the prefiddler library](https://ramblings.mcpher.com/vuejs-apps-script-add-ons/helper-for-fiddler/) to write and format sheets containing duplicate file results

## What's Next?

This is the first step in a larger demonstration. A subsequent article and update will show how to:
1.  **Containerize** this Node.js application.
2.  **Deploy** it to **Google Cloud Run**, enabling it to run as a serverless job triggered by events or schedules, still bypassing the GAS limits but now in a fully managed cloud environment.


