# Contributing

Contributions are welcome. You can contribute in a variety of ways, including (but not limited to):
- [Opening a pull request](../../compare) with your changes - be sure to assign me as a reviewer!
- [Opening an issue](../../issues/new/choose) to report a bug or request a feature.
    - Please check [existing issues](../../issues) first to avoid duplicates.
    - Note that I use issues liberally to track things that I want to do, including enhancements. If an issue is important to you, @ me directly to make sure I see it (or fix it yourself!).

Please note that I'm one guy, and I have a day job. This is a hobby and many of the things I make public are things I've found useful. This code is presented in the hope that it may be useful
to others, but I make no guarantees about anything.

## Development Setup

Familiarize yourself with [vscode extension development](https://code.visualstudio.com/api) before diving in. This is a fairly simple extension, but do pay attention to best practices.

### Setup:
1. Install the required dependencies:
   - VSCode - obviously
   - [Node.js](https://nodejs.org/en/download)
   - [AutoHotkey v2](https://www.autohotkey.com/download/)
      - The [runner integration tests](./src/test/suite/runner.test.ts) assume that you have AHK installed at the default location in `C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe`. If you don't they'll fail with `ENOENT errors`. 
      - When testing manually, you can of course set the path to whatever value you like.
2. Clone this repository
3. At the repo root, set up the project:
   ```cmd
   npm install
   ```
4. It's not required, but I highly recommend installing the recommende VSCode extensions. You should get a notification when you first start VSCode.