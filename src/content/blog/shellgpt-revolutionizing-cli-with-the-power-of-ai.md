---
title: 'ShellGPT: Revolutionizing Command-Line Interactions with the Power of AI'
pubDate: 2023-05-21T12:22:34.284Z
heroImage: '../../assets/images/posts/2023-05-21/featured.webp'
tags:
  - "ShellGPT"
  - "CLI"
  - "AI"
  - "Linux"
  - "Bash"
  - "Powershell"
description: 'ShellGPT: Harnessing AI Power in Your Terminal - A concise guide to installing and using ShellGPT, a revolutionary tool that transforms your command-line interactions and streamlines your workflow.'
---

ShellGPT, a powerful command-line tool, revolutionizes how developers and administrators interact with their terminals. I've used it in Powershell and WSL for the past few months, and it's incredible and has quickly become my favorite CLI tool. By leveraging the capabilities of OpenAI's GPT models, ShellGPT offers a wide range of functionalities, such as generating shell commands, code snippets, comments, and documentation. 

This tool eliminates the need for cheat sheets and notes, providing accurate answers directly in the terminal. This reduces the frequency of Google searches and saves valuable time and effort. 

One of the key strengths of ShellGPT is its ability to work with all major operating systems and shells. Whether you're using Linux, macOS, Windows, PowerShell, CMD, Bash, Zsh, Fish, or any other shell, ShellGPT has got you covered.

## Installation

To get started with ShellGPT, you need to install it on your system. The installation process is straightforward and requires only pip and an OpenAI API key, and you can generate one [here](https://platform.openai.com/account/api-keys). Here's a step-by-step guide on how to install ShellGPT:

First, ensure that you have Python and pip installed on your system. You can verify the installation by typing

```bash
python --version
```
```bash
pip --version
```
in your terminal. If Python and Pip are not installed, you can download them from the official Python website.

Once Python and pip are installed, you can install ShellGPT by typing

```bash
pip install shell-gpt==0.9.1 
```

in your terminal and press enter.

After the installation, you need an OpenAI API key to use ShellGPT. With the OpenAI API key, you're all set to use ShellGPT. To access the OpenAI API, ensure that the $OPENAI_API_KEY environment variable is set. If it's not set, you will be prompted to enter your key. Once entered, it will be securely stored in the ~/.config/shell_gpt/.sgptrc directory.

**Demo**

<div style="text-align: center">
<a href="https://www.youtube.com/watch?v=_Ll-gsdTpO8" class="glightbox video-link" data-glightbox="title: ShellGPT Demo">
  <img src="https://img.youtube.com/vi/_Ll-gsdTpO8/hqdefault.jpg" alt="ShellGPT Demo" width="560" height="315" loading="lazy" />
  <span class="play-button" aria-hidden="true"></span>
</a>
</div>

## Usage

Once installed, ShellGPT can be used for a variety of tasks. It can function as a standard search engine, answering any query. It can also summarize and analyze data, making it easier to understand complex information. One of the standout features of ShellGPT is its ability to generate shell commands and even code. 

## Generating Code

For instance, if you ask ShellGPT to implement Bubble Sort with Python, it will generate the Python code. Bubble Sort is a basic sorting method that works by going through a list, comparing adjacent elements, and swapping them if they are not in the correct order. The pass of the list is repeated until the list is sorted.

**Generate a Python implementation of Bubble Sort:**

```bash
sgpt --code "create an implementation of bubble sort with python."

def bubble_sort(arr):
    n = len(arr)

    # Traverse through all array elements
    for i in range(n):
        # Last i elements are already in place, so inner loop goes until n-i-1
        for j in range(0, n-i-1):
            # Swap if the element found is greater than the next element
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]

# Test the function
arr = [64, 34, 25, 12, 22, 11, 90]
bubble_sort(arr)
print("Sorted array is:", arr)
```

When you run this script, it will print: Sorted array is: [11, 12, 22, 25, 34, 64, 90]. And given that it's valid Python code, we can redirect the output to file

**Redirect output to file:**
```bash
sgpt --code "create an implementation of bubble sort with python" > bubble.py
python bubble.py
# Sorted array is: [11, 12, 22, 25, 34, 64, 90]
```

Users can also utilize the flexibility of pipes to pass input into sgpt

**Use pipes to pass input into sgpt:**
```bash
cat bubble.py | python -m sgpt --code "Generate comments for each line of my code."
# Define a function called bubble_sort that takes in an array as an argument
def bubble_sort(arr):
    # Get the length of the array
    n = len(arr)
    # Loop through the array
    for i in range(n):
        # Loop through the array again, but only up to n-i-1
        for j in range(0, n-i-1):
            # If the current element is greater than the next element
            if arr[j] > arr[j+1] :
                # Swap the two elements
                arr[j], arr[j+1] = arr[j+1], arr[j]
    # Return the sorted array
    return arr

# Create an array to test the function
arr = [64, 34, 25, 12, 22, 11, 90]
# Call the bubble_sort function on the array
bubble_sort(arr)
# Print the sorted array
print("Sorted array is:", arr)
```
The code generation functionality of ShellGPT is a robust tool that can be used to generate valid, executable code in response to user queries. This feature can be handy for tasks such as implementing algorithms, generating code snippets, and data structures, creating test cases, making boilerplate code, writing database queries, creating API requests, regular expressions, and the list goes on and on.

## Chat

ShellGPT also includes a chat feature that allows you to interact with it. You can start a chat session using the --chat option, followed by a unique session name and a prompt. This feature can improve GPT suggestions **iteratively** by providing additional details.

**Start a chat named 'dinner-ideas':**
```powershell
sgpt --chat dinner-ideas "please provide three ideas for dinner tonight." 
# 1. Grilled chicken with roasted vegetables
# 2. Spaghetti with meatballs and garlic bread
# 3. Fish tacos with avocado salsa and black beans

sgpt --chat dinner-ideas "what are some additional sides that would complement option #2?"
# Some additional sides that would complement spaghetti with meatballs and garlic bread could be:
# 1. Caesar salad
# 2. Roasted asparagus
# 3. Garlic roasted potatoes
# 4. Steamed broccoli
# 5. Caprese salad with fresh tomatoes and mozzarella.
```
To display all the ongoing chat sessions, utilize the --list-chats option:

```bash
sgpt --list-chats
# .../shell_gpt/chat_cache/food
# .../shell_gpt/chat_cache/python_code
```

To view all the messages associated with a specific chat session, use the --show-chat option followed by the session identifier:

```bash
sgpt --show-chat food
# user: remember my favorite dish: spaghetti
# assistant: I'll remember that your favorite dish is spaghetti.
# user: what would be a good wine pairing for my favorite dish?
# assistant: A good wine pairing for spaghetti, especially if it's served with a tomato-based sauce, would be a medium-bodied red wine like a Chianti or a Sangiovese.
```

These commands allow you to manage and review your chat sessions with ShellGPT, making it easier to keep track of your interactions and retrieve important information.

## Summarization and Analysis

ShellGPT offers the flexibility to accept prompts from either standard input (stdin) or command line arguments, allowing you to choose the input method that best suits your needs. This adaptability is especially beneficial when you need to feed file content or pipe output from other commands to the GPT models for summarization or analysis.

For instance, you can effortlessly **generate a git commit message based on a diff:**

```bash
git diff | sgpt "Craft a git commit message for my modifications."
# -> Commit message: Refactor User class and update validation logic
```

ShellGPT can also analyze logs from various sources by accepting them via stdin or command line arguments, along with an intuitive prompt. This empowers you to pinpoint errors and receive suggestions for potential solutions swiftly.

**Linux Example:**
```bash
tail -n 20 /var/log/syslog | sgpt "Analyze these logs, identify anomalies, and suggest potential fixes."
# ...
```

**Windows Example:**
```powershell
Get-EventLog -LogName Application -EntryType Error -Newest 50 | sgpt "analyze output and suggest resolutions for issues found"
```

This robust feature significantly simplifies managing and interpreting data from various sources, particularly when troubleshooting system issues. By reviewing log files and suggesting potential solutions to identified errors, ShellGPT allows you to focus on the most crucial task: resolving issues and optimizing your systems and applications.

## Shell Commands

Ever found yourself scratching your head over common shell commands, such as chmod, and having to search for the syntax online? With the --shell or -s option, ShellGPT allows you to swiftly find and execute the commands you need directly in the terminal.

```bash
sgpt --shell "set all files in the current directory to read-only."
# -> chmod 444 *
# -> Execute shell command? [y/N]: y
# ...
```

ShellGPT is aware of your operating system and the shell you're using, and it tailors the shell commands to your specific system. For example, if you ask ShellGPT to refresh your system, it will return a command based on your OS. Here's an example using macOS:

**macOS:**
```bash
sgpt -s "update my system"
# -> sudo softwareupdate -i -a
```

The same prompt, when used on Ubuntu, will generate a different suggestion:

**Linux:**
```bash
sgpt -s "update my system"
# -> sudo apt update && sudo apt upgrade -y
```

Let's experiment with some Docker containers:

```bash
sgpt -s "launch nginx using Docker, redirect ports 443 and 80, mount current directory containing index.html"
# -> docker run -d -p 443:443 -p 80:80 -v $(pwd):/usr/share/nginx/html nginx
# -> Execute shell command? [y/N]: y
# ...
```

You can still utilize pipes to feed input to ShellGPT and receive shell commands as output:

```bash
echo '{"key": "value"}' | sgpt -s "use curl to POST this JSON to localhost"
# -> curl -X POST -H "Content-Type: application/json" -d '{"key": "value"}' http://localhost
```
We can incorporate additional shell tricks in our prompt. In this example, we're passing file names to ffmpeg:

```bash
ls
# -> clip1.mp4 clip2.mp4 clip3.mp4
sgpt -s "use ffmpeg to merge these videos into one, without audio. Video file names: $(ls -m)"
# -> ffmpeg -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 -filter_complex "[0:v] [1:v] [2:v] concat=n=3:v=1 [v]" -map "[v]" output.mp4
# -> Execute shell command? [y/N]: y
# ...
```

These examples demonstrate the versatility and power of ShellGPT in generating shell commands, making it a valuable tool for both beginners and experienced users.

## Full list of Arguments

```text 
╭─ Arguments ─────────────────────────────────────────────────────────────────────────────────────────────────╮
│   prompt      [PROMPT]  The prompt to generate completions for.                                             │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ Options ───────────────────────────────────────────────────────────────────────────────────────────────────╮
│ --model            [gpt-3.5-turbo|gpt-4|gpt-4-32k]  OpenAI GPT model to use. [default: gpt-3.5-turbo]       │
│ --temperature      FLOAT RANGE [0.0<=x<=2.0]        Randomness of generated output. [default: 0.1]          │
│ --top-probability  FLOAT RANGE [0.1<=x<=1.0]        Limits highest probable tokens (words). [default: 1.0]  │
│ --editor                                            Open $EDITOR to provide a prompt. [default: no-editor]  │
│ --cache                                             Cache completion results. [default: cache]              │
│ --help                                              Show this message and exit.                             │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ Assistance Options ────────────────────────────────────────────────────────────────────────────────────────╮
│ --shell  -s                 Generate and execute shell commands.                                            │
│ --code       --no-code      Generate only code. [default: no-code]                                          │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ Chat Options ──────────────────────────────────────────────────────────────────────────────────────────────╮
│ --chat        TEXT  Follow conversation with id, use "temp" for quick session. [default: None]              │
│ --repl        TEXT  Start a REPL (Read–eval–print loop) session. [default: None]                            │
│ --show-chat   TEXT  Show all messages from provided chat id. [default: None]                                │
│ --list-chats        List all existing chat ids. [default: no-list-chats]                                    │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ Role Options ──────────────────────────────────────────────────────────────────────────────────────────────╮
│ --role         TEXT  System role for GPT model. [default: None]                                             │
│ --create-role  TEXT  Create role. [default: None]                                                           │
│ --show-role    TEXT  Show role. [default: None]                                                             │
│ --list-roles         List roles. [default: no-list-roles]                                                   │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Conclusion

ShellGPT offers a wealth of features I've yet to explore fully, but they are readily available for you to utilize. Among these is the ability to create custom roles, which can be used to generate code, shell commands, or to fulfill your specific needs. ShellGPT also includes a runtime configuration file to set up some parameters, providing further customization options.

Another feature worth mentioning is the REPL (Read-Eval-Print Loop) mode. This interactive mode allows you to chat with GPT models in real time, and it can work in conjunction with the --shell and --code options, making it incredibly useful for interactive shell commands and code generation.

For Docker enthusiasts, ShellGPT can be run in a Docker container using the OPENAI_API_KEY environment variable and a Docker volume to store the cache. The provided Dockerfile can also be used to build your image, offering deployment flexibility.

In conclusion, ShellGPT is a powerful tool that brings the capabilities of AI to your terminal, enhancing efficiency and accessibility in your daily tasks. For more detailed information and further exploration, visit the official [ShellGPT GitHub page](https://github.com/TheR1D/shell_gpt).