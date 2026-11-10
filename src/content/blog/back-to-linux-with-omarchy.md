---
title: "I Came Back to Linux and Let the Chef Order"
description: "Sixteen years on Linux, a few years away on Windows and WSL, and then Omarchy showed up. I imaged the laptop first. The desktop didn't last a month."
pubDate: 2026-11-10
tags:
  - "Linux"
  - "Omarchy"
  - "AI"
  - "Homelab"
draft: false
heroImage: '../../assets/images/posts/2026-11-10/featured.webp'
---

A few weeks ago I wiped my laptop and imaged it with **Omarchy**. The laptop was supposed to be the test machine, the one I could afford to break. I fell in love with it, and a few weeks later I did the same thing to my desktop, which is the one with everything on it. I have the self-control of a dog near a dropped sandwich.

Some background. I ran Linux for sixteen years straight, and it was the only thing on my machines. A few years ago I went back to Windows, and the reason was WSL, the Windows Subsystem for Linux. (That's Linux running inside Windows. Microsoft named it backwards.) So I left Linux for an operating system whose best feature, as far as I was concerned, was Linux in a window. It was like moving out of your house so you could rent a room in it.

I didn't see the irony at the time. I thought I was being practical. And it did work, I got years of real work done that way. But every day I was opening a little window to visit the place I used to live, and that gets old.

## Chef's choice

Omarchy is Arch Linux with the **Hyprland** tiling window manager on top. DHH, the Ruby on Rails guy, put it together, and he describes it with one word: *omakase*. It's Japanese for chef's choice, and it's the politest way anybody has found to say shut up and eat. Nobody hands you a menu. Someone who has thought about this a lot harder than you have decides what you're having.

Software people call this being *opinionated*, which I love. When a person is opinionated you stop inviting him to things. When software is opinionated it means somebody finally made a goddamn decision.

If you've done Linux the old way you know what that's worth. The old way was freedom, and on the Linux desktop freedom meant you were free to spend a Saturday choosing a font. I wrote the cost down once. There's [a post on this blog](/blog/riced-out-terminal/) where I walk you through making a terminal look good, and it takes eight steps: fonts, shell, framework, theme, plugins, config file. Eight steps for one window, and I published that on purpose.

Omarchy shows up with all of it already done, for every window, in a matching color scheme. You boot the ISO and land on a desktop where the terminal, the editor, the bar, the launcher and the lock screen all look like the same person picked them, because the same person did. Change the theme and the whole machine changes with it.

The project calls itself "the malleable OS for the age of agents." I haven't heard anyone say *malleable* out loud since high school chemistry. The current generation is called Quattro, it rebuilt the whole desktop shell from the ground up, and it reportedly cleared two hundred thousand downloads in eighteen days. After this long in IT my eyes roll at a tagline before I finish reading it. I'm giving this one a pass.

## Fingers first

*Tiling window manager* sounds like a guy you call about your bathroom. What it means is you quit dragging windows around like furniture and tell them where to go with the keyboard. Super and Space opens a launcher that fuzzy-matches whatever you half remember, with apps and system commands in the same box. Windows open, snap in next to each other, and stay out of the way.

There are a lot of key bindings and I'm picking them up pretty easily. I'm a grown man and I got a little rush the first time a window went where I told it to. I'm not proud of that and I'm not going to stop.

I'm doing all of this on a regular keyboard. The [Corne](/blog/relearning-to-type/), the forty-key split board I've been relearning how to type on, isn't set up on this machine yet. It's on the roadmap. Once the Corne and the key bindings are both mastered I'm going to feel like one of the kids from *Hackers*, the one from 1995. Nobody in that movie had a day job or a thumb splint, but I'll take it.

## The part where it runs itself

Right now this machine has **Claude**, **Grok**, **Codex**, **Muse**, **Hermes**, and local models running through **Pi**, an agent harness, by way of **Ollama**. That's a lot of roommates and not one of them does dishes.

Omarchy is built for this. It ships with a skill that teaches those agents how the system is put together (the window manager config, the bar, the themes), and 4.5, the release I'm on, tracks twenty-three different agents and providers from one panel. I used to do this part of Linux with a wiki tab, a config file and a nine-page forum thread, where page one is a guy with your exact problem and page nine is the same guy writing "never mind, fixed it." Now I ask, and the machine does it.

This system runs itself, and anything you want, you can have.

It also brings me back to Arch, which was my favorite distro back in the day, although maintaining it was a part-time job. I didn't have super intelligent agents running in it back then. Now I do, so I started my first system agent in Hermes. Its whole job is to keep Omarchy running smoothly and as optimized as possible.

DHH says agents are how you "truly democratize Linux." Tech people say *democratize* when they mean you no longer have to be an asshole about it to use it. Linux was always free, it just charged you in weekends. I paid that for sixteen years and I think he's right.

## Everything came with me

A pretty desktop is easy to love when there's nothing on it. Then you have to move in.

All of my custom apps are up and running, Hermes and my Grok bot included. The **Jellyfin** server is back with a sweet downloading setup: **Prowlarr** finds things, **Sonarr** handles TV, **Radarr** handles movies, and all of it goes out through a **Mullvad** connection in an isolated container.

It's for Linux ISOs. Everybody with this setup says it's for Linux ISOs. There are more people downloading Linux ISOs through a VPN than there are people running Linux, and nobody finds that strange.

The graph and RAG MCPs I built over my Cowork corpus came over too. On the old setup Cowork sat in Windows while the MCPs ran from WSL. On Omarchy I combined them into one app, and it indexes a hundred times faster. At least it feels that way.

I've got SSH set up from the laptop to the desktop over **Tailscale**, and my dotfiles are managed with **GNU Stow**, which keeps the two machines synced up well. Getting all of this running took a lot less swearing than I'd budgeted for, and the reimaged setup is so much more efficient than what I had.

## The one thing I knew I'd miss

There was one Windows app I knew I'd miss, and it was **Phone Link**. It put my Android notifications on my PC and let me mirror the phone on my screen. I'll admit how small that is. What it really did was save me from picking up my phone, which is never more than a foot from my hand. I was ready to grieve that.

It's also the kind of small thing that used to send people back to Windows. There was always one app with no Linux equivalent, and you kept a dual boot around for it like a spare tire.

So I built my own with Claude, and I'll let you guess which of us did more of the typing. There's an .apk on my phone that connects to both the laptop and the desktop over Tailscale. An Android icon in my top bar tells me when alerts arrive on the phone, I can clear them like I did on Windows, and I can mirror the phone on the PC when I need to. The mirroring uses **scrcpy**.

It took less than an hour to build and test. I've sat in change-control meetings that ran longer than that and decided less.

## The honest part

So far, no annoyances. I keep checking anyway, like a guy patting his pockets for a wallet that's right there.

I know what a few weeks is worth. Every distro I've ever installed was perfect for the first month, and I've installed a lot of distros. The first month is also when you tell everybody about it, which is what I'm doing right now.

Chef's choice has a catch too. These are somebody else's opinions about how a computer should work, and the first time I disagree with the chef I'll find out how much of the kitchen I understand. What's different this time is that I can change any of it by asking.

I spent sixteen years on Linux, left, and spent the years after that running it in a window on somebody else's desktop. Now it's on both machines and the window is gone. Coming back was easier than I expected and I'm a little suspicious of that, because Linux has taught me that easy doesn't usually last.

I'll report back when something breaks. Something always breaks, and that's about half of why I missed it.
