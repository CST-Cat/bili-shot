# BiliShot

[中文](README.md)

BiliShot is a userscript for copying the current Bilibili video frame to the clipboard with a hotkey.

Default hotkey: `W`

Default image format: `PNG`

## Features

- Copy the current video frame to the clipboard
- Supports PNG, JPG, WebP, and AVIF
- Customize the screenshot hotkey from the userscript menu
- Customize the image format from the userscript menu
- Works on Bilibili desktop and mobile pages
- No network requests

## Install

Install a userscript manager such as Tampermonkey or Violentmonkey, then install:

https://raw.githubusercontent.com/CST-Cat/bili-shot/main/bili-shot.user.js

## Menu

- `BiliShot: 复制当前视频帧`
- `BiliShot: 设置快捷键`
- `BiliShot: 设置图片格式`
- `BiliShot: 恢复默认快捷键`

## Notes

PNG has the best compatibility. JPG, WebP, and AVIF depend on browser support for canvas export and clipboard writing.

## License

MIT
