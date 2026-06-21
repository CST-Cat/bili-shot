# BiliShot

[English](README.en.md)

BiliShot 是一个用于 Bilibili 的用户脚本，可以用快捷键把当前视频帧复制到剪贴板。

默认快捷键：`W`

默认图片格式：`PNG`

## 功能

- 复制当前视频帧到剪贴板
- 支持 PNG、JPG、WebP、AVIF
- 可在用户脚本菜单中修改快捷键
- 可在用户脚本菜单中修改图片格式
- 支持 Bilibili 桌面端和移动端页面
- 不发送网络请求

## 安装

先安装 Tampermonkey 或 Violentmonkey 等用户脚本管理器，然后安装：

https://raw.githubusercontent.com/CST-Cat/bili-shot/main/bili-shot.user.js

## 菜单

- `BiliShot: 复制当前视频帧`
- `BiliShot: 设置快捷键`
- `BiliShot: 设置图片格式`
- `BiliShot: 恢复默认快捷键`

## 说明

PNG 兼容性最好。JPG、WebP、AVIF 取决于浏览器对 canvas 导出和剪贴板写入的支持。

## 许可证

MIT
