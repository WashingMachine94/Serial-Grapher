# Serial Grapher

Serial Grapher is a powerful VS Code extension for visualizing real-time data from microcontrollers, sensors, and embedded devices. It is designed for embedded systems engineers, makers, students, and hobbyists who want to monitor live signals, debug hardware, and inspect data without leaving the editor.

## What it does

Connect to your microcontroller using serial or Bluetooth, or import an existing log file such as CSV. Once data is available, each incoming line is processed through configurable parsers. For Bluetooth streams, each message is treated as a separate line, and for serial data each newline-delimited message is parsed in sequence.

Using regular expressions, each line is split into structured nodes that store the data values. It is recommended to include a timestamp variable and set that node as the timestamp field for the most accurate and reliable visualization.

## Build graphs from your data

Open the Graph tab to create new graphs and drag in the nodes you want to plot. Add the timestamp node to each graph so the visualization can track time accurately, then connect the values you want to display. When you press Subscribe, incoming data is fed through the parsers and shown live on the selected graphs.

## Work with files and saved configurations

You can also upload a file of recorded data and visualize it the same way as live input. After capturing data, export it as CSV for analysis, documentation, or sharing. If you have a setup you want to reuse, you can save your current configuration, including your parsers and graphs, and load it again later.

## Why use Serial Grapher

- Realtime visualization of data from microcontrollers
- Great for embedded systems engineering, prototyping, debugging, and maker projects
- Supports both serial and Bluetooth connections
- Lets you parse data with regex-driven node extraction
- Enables custom graph creation with time-based plotting
- Exports captured data for later review
- Saves and restores working configurations

Serial Grapher gives you a simple way to turn raw device output into useful insights and clean visual timelines directly inside VS Code.
