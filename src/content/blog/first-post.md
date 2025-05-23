---
title: 'Customize Your Terminal: A Comprehensive Guide to Enhancing Your Linux CLI Experience'
pubDate: 'Aug 8 2021'
heroImage: '/featured.webp'
slug: riced-out-terminal
tags:
  - "Linux"
  - "CLI"
  - "Tutorial"
  - "Oh-my-zsh"
  - "Powerlevel10K"
  - "ColorLS"
description: 'A guide to make your terminal look and feel professional. Transform your boring default stock terminal into a riced-out beast.'
prefetchDomains:
  - "//c.disquscdn.com"
  - "//thebiglaskowski.disqus.com"
  - "//www.googletagmanager.com"
  - "//apis.google.com"
  - "//connect.facebook.net"
  - "//cdn.jsdelivr.net"
  - "//fonts.gstatic.com"
  - "//www.gstatic.com"
---

Enhancing the appearance and functionality of your Terminal can be a fun and rewarding way to personalize your workspace. This tutorial will demonstrate how to transform your Ubuntu terminal into a visually appealing and professional environment using color schemes, the Color LS Ruby gem, and other valuable tools. By the end of this guide, your Terminal will look fantastic and improve your daily workflow.

## Customize Your Terminal in Ubuntu 20.04

### 1. Install base-16-gnome-terminal
The default shell in Ubuntu 20.04 is the Gnome terminal. Follow the instructions on the [base16 github page](https://github.com/chriskempson/base16) to locate the shell you are using and install the desired color scheme.

### 2. Download and Install the Patched Hack Nerd Font
Nerd Fonts is a set of modified fonts with additional glyphs or symbols. Download the hack.zip file from the [Nerd fonts download page](https://www.nerdfonts.com/font-downloads), extract the contents, and install the "Hack Regular Nerd Font Complete.ttf" font. Then, set it as your terminal font in Gnome terminal preferences.

### 3. Install Ruby and Color LS
Color LS is a Ruby gem that adds color to the ls command output. Install Ruby and Color LS with the following commands:

```bash
sudo apt install ruby-full
sudo gem install colorls
```
### 4. Install ZSH and Make It Your Default Shell
ZSH is a powerful command-line interpreter or shell for UNIX-based operating systems. Install ZSH and make it your default shell with the following commands:

```bash
sudo apt install zsh
chsh -s $(which zsh)
```

Log out and back in again to apply the changes in Ubuntu.

### 5. Install Oh My Zsh Framework
Oh-My-ZSH is an open-source framework for managing the ZSH shell. It provides a large collection of plugins and themes for ZSH. Install Oh-My-ZSH with the following command:

```bash
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

### 6. Install the PowerLevel10K Theme and Plugins
PowerLevel10K is a popular ZSH theme with a modern and powerful appearance. Install PowerLevel10K, auto suggestions, and syntax highlighting plugins with the following commands:

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
git clone https://github.com/zsh-users/zsh-autosuggestions.git $ZSH_CUSTOM/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $ZSH_CUSTOM/plugins/zsh-syntax-highlighting
```

### 7. Edit the .zshrc Configuration
Customize your .zshrc configuration file with the appropriate changes, including setting the PowerLevel10K theme, enabling command auto-correction, adding downloaded plugins, and creating aliases for Color LS.

```bash
# Open .zshrc with your preferred text editor, e.g., vim or nano
vim ~/.zshrc

# Find the ZSH_THEME line and change it to
ZSH_THEME="powerlevel10k/powerlevel10k"

# Add the following line right below ZSH_THEME to incorporate the patched Hack Nerd font installed earlier
POWERLEVEL10K_MODE="nerdfont-complete"

# Uncomment the following line to enable command auto-correction
ENABLE_CORRECTION="true"

# To add the plugins we downloaded, edit plugins=(git) as shown
plugins=(
git
zsh-autosuggestions
zsh-syntax-highlighting
)

# Add the following lines anywhere in your configuration
# Color LS
export LS_COLORS

# Create a few aliases to use Color LS by default
alias ls='colorls -A --gs --sd'
alias ll='colorls -lA --gs --sd'
alias lt='colorls --tree --gs --sd'

# Save and exit the file
```
Remember to replace vim with your preferred text editor if needed. After saving and closing the file, restart your terminal or run **source ~/.zshrc** to apply the changes.

### 8. Run or Re-Run the Powerlevel10K Theme Setup
Configure the Powerlevel10K theme with the following command:

```bash
p10k configure
```
![Screenshot of riced out terminal](/riced-out-term.webp)

You can run the configuration setup multiple times to fine-tune your Terminal's appearance. Experiment with various options provided by Powerlevel10K to create a unique and personalized terminal interface that meets your specific needs and preferences.

With these steps, you can enjoy a visually appealing and functionally efficient terminal experience. By using the customization options available in Powerlevel10K, Color LS, and other tools, you can create an aesthetically pleasing terminal interface tailored to your workflow.

## Additional Customizations and Tools
To further enhance your terminal experience, consider exploring additional customizations and tools:

### 1. Explore Additional ZSH Plugins
There are numerous ZSH plugins available that can improve your terminal experience. Browse the [Oh-My-ZSH plugins page](https://github.com/ohmyzsh/ohmyzsh/wiki/Plugins) for a comprehensive list of available plugins, and choose ones that suit your needs.

### 2. Customize Your Terminal Colors
Suppose you want to further customize your Terminal's colors. In that case, you can use tools like [Terminal.sexy](https://terminal.sexy/) or [Gogh](https://github.com/Mayccoll/Gogh) to create or choose from a wide range of color schemes that can be easily imported into your terminal preferences.

### 3. Customize Your Shell Prompt
Customize your shell prompt to display additional information or to match your preferred style. You can use tools like [Starship](https://starship.rs/) or [Pure](https://github.com/sindresorhus/pure) to create a minimalist and informative prompt. You can also manually customize your prompt by editing your .zshrc or .bashrc files.

### 4. Use a Terminal Multiplexer
A terminal multiplexer, like [tmux](https://github.com/tmux/tmux) or [screen](https://www.gnu.org/software/screen/), allows you to create multiple terminal sessions within a single terminal window. This can improve your productivity by allowing you to easily switch between tasks without opening multiple terminal windows.

### 5. Integrate Git and Other Version Control Systems
Integrate your Terminal with Git or other version control systems to streamline your development workflow. You can install plugins like [zsh-git-prompt](https://github.com/olivierverdier/zsh-git-prompt) or [zsh-git-flow](https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/git-flow) to display branch and status information directly in your terminal prompt.

By experimenting with these additional customizations and tools, you can create a truly unique and efficient terminal environment tailored to your specific needs and preferences. A well-configured terminal can improve your productivity, make it easier to navigate your filesystem, and provide a visually pleasing workspace that you'll enjoy using daily.
