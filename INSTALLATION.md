# Brain food 全流程安装与使用文档

Brain food 是一个 Chrome 扩展：把文章保存到本地阅读列表，在飞书日历中自动预约阅读时间，阅读时在侧边栏记录想法，读完后把文章和回顾汇总到同一篇飞书文档。

本文按 macOS + Chrome + 飞书用户身份编写。第一次安装建议从头到尾执行一遍。

## 一、准备工作

- macOS 电脑
- Google Chrome
- Node.js 18 或更高版本
- 一个可以使用飞书日历和云文档的飞书账号
- 已授权的 `lark-cli`

Brain food 的数据流：

~~~text
Chrome 扩展
   ↓ localhost
本机 helper
   ↓ lark-cli（用户身份）
飞书日历 + 飞书云文档
~~~

扩展不保存飞书密钥。飞书登录信息由 `lark-cli` 保存在本机配置中，helper 只监听本机地址 `127.0.0.1:8787`。

## 二、获取代码

### 方式 A：直接下载 ZIP

点击下载：[Brain food 插件代码 ZIP](https://github.com/lufan808/brain-food/archive/refs/heads/main.zip)

下载后解压，得到一个类似 `brain-food-main` 的文件夹。Chrome 加载时选择解压后的文件夹，不要选择 ZIP 文件。

### 方式 B：使用 Git 克隆

打开“终端”，执行：

~~~bash
cd ~/Documents
git clone https://github.com/lufan808/brain-food.git
cd brain-food
~~~

如果已经下载过代码，进入已有目录：

~~~bash
cd /你的路径/brain-food
~~~

确认当前目录能看到 `manifest.json`：

~~~bash
ls manifest.json helper src
~~~

## 三、安装和配置 lark-cli

### 1. 检查 Node.js

~~~bash
node --version
npm --version
~~~

如果能看到版本号即可继续；如果提示找不到命令，请先安装 Node.js，再重新打开终端。

### 2. 安装 lark-cli

~~~bash
npm install -g @larksuite/cli
lark-cli --version
~~~

如果安装后提示 `command not found: lark-cli`，先查看 npm 全局目录：

~~~bash
npm prefix -g
command -v lark-cli
~~~

必要时在启动 helper 时使用 `LARK_CLI` 指定完整路径，见第五部分。

### 3. 配置飞书应用

第一次使用 `lark-cli` 执行：

~~~bash
lark-cli config init
~~~

如果还没有自己的飞书自建应用，可以执行：

~~~bash
lark-cli config init --new
~~~

按提示打开飞书页面，选择或创建一个自建应用并完成配置。App Secret 只保存在本机，不要复制到聊天、GitHub 或插件代码中。

### 4. 授权飞书用户身份

Brain food 需要以用户身份访问自己的日历。执行：

~~~bash
lark-cli auth login --scope "calendar:calendar.event:create calendar:calendar.event:read calendar:calendar.event:update calendar:calendar.event:delete calendar:calendar.free_busy:read calendar:calendar:readonly"
~~~

为了创建和更新唯一的阅读回顾文档，再授权文档和云盘业务域：

~~~bash
lark-cli auth login --domain docs --domain drive
~~~

如果你的 CLI 版本不支持业务域写法，按错误中的 `missing_scopes` 使用 `auth login --scope "..." ` 重新授权。授权范围会累积，不需要重复配置已经成功的权限。

### 5. 检查登录状态

~~~bash
lark-cli auth status --json --verify
lark-cli whoami
lark-cli calendar +freebusy --as user
~~~

确认当前身份是 `user`，登录状态有效，并且忙闲命令可以返回 JSON。不要用 `--as bot` 访问个人日历或个人文档。

## 四、启动本地 helper

helper 是扩展和飞书之间的本地桥接程序，不需要额外安装 npm 依赖。

打开一个新的终端窗口，进入项目目录：

~~~bash
cd /你的路径/brain-food/helper
npm start
~~~

看到下面的内容说明启动成功：

~~~text
Brain food helper is running.
Listening on http://127.0.0.1:8787
~~~

使用插件期间不要关闭这个终端窗口。

如果系统找不到 `lark-cli`，先执行：

~~~bash
command -v lark-cli
~~~

如果返回完整路径，可以这样启动：

~~~bash
cd /你的路径/brain-food/helper
LARK_CLI="$(command -v lark-cli)" npm start
~~~

也可以双击 `helper/start.command`。如果双击后窗口立即关闭，改用终端运行以查看报错。

另开一个终端检查 helper：

~~~bash
curl -s http://127.0.0.1:8787/health
~~~

预期返回：

~~~json
{"ok":true,"service":"reading-block-helper","port":8787}
~~~

如果提示端口已被占用，通常说明 helper 已经在运行，不需要重复启动。

## 五、在 Chrome 中加载扩展

1. 打开 Chrome，在地址栏输入 `chrome://extensions`。
2. 打开右上角 **Developer mode / 开发者模式**。
3. 点击左上角 **Load unpacked / 加载已解压的扩展程序**。
4. 选择包含 `manifest.json` 的项目根目录，例如 `brain-food-main` 或 `brain-food`。
5. 加载成功后，扩展卡片标题应显示 **Brain food**。
6. 点击 Chrome 工具栏右侧的拼图图标，把 Brain food 固定到工具栏。

不要选择 `src` 或 `helper` 文件夹，必须选择最外层、能直接看到 `manifest.json` 的目录。

## 六、第一次使用

### 1. 保存三篇文章

打开三篇想读的文章，分别点击工具栏里的 Brain food 图标。

第一次使用会强制用 3 篇文章触发预约，这是为了让新用户明确找到入口。第三次保存后，插件会查询飞书日历空闲时间，跳过已有会议和已安排过阅读的日期，并创建一次阅读日程。

默认设置是：

- 工作日 14:00–18:00
- 每次阅读 30 分钟
- 至少提前 2 小时预约
- 未来最多查找 14 天

### 2. 自定义后续预约数量

第一次预约成功后，右键点击 Brain food 图标，选择 **Settings**。可以调整可预约星期、时间范围、阅读时长、后续每次触发所需的文章数量（1–20 篇）、查找天数、日历 ID 和日程标题。

之后达到你设置的文章数量时，插件会自动创建下一次阅读预约。

### 3. 边读边记录

保存文章后，在文章页面再次点击 Brain food 图标，或右键菜单选择 **Add notes**，打开侧边栏。

侧边栏支持：

- 文章类型
- 我的想法
- 重点摘录
- 疑问
- 下一步行动

内容会自动保存到 Chrome 本地存储。文章类型会根据标题和网址给出初始建议，也可以手动修改。分类包括：技术与工具、营销与业务、学习与研究、行业与趋势、生活与灵感、其他。

### 4. 完成阅读并生成回顾文档

阅读日程结束后，插件会打开回顾清单：

- 勾选读完的文章：标记为已读，并加入回顾文档；
- 不勾选的文章：回到待阅读列表，下次继续预约；
- 点击 **Done**：同步更新飞书回顾文档。

插件只维护一篇飞书阅读回顾文档，不会为每篇文章单独创建文档。文档按文章类型分类，每篇文章保留原文名称、原文链接、完成时间、回顾想法、重点摘录、疑问和下一步行动。文档创建后可从设置页的 **Reading review document** 打开。

## 七、日常启动顺序

1. 打开终端，启动 `helper`。
2. 确认 `curl -s http://127.0.0.1:8787/health` 返回 `ok:true`。
3. 打开 Chrome，确认 Brain food 已加载。
4. 保存文章。
5. 到预约时间阅读，并在侧边栏记录想法。
6. 阅读结束后完成回顾清单。

## 八、常见问题

### 无法连接 helper

执行：

~~~bash
curl -s http://127.0.0.1:8787/health
~~~

没有返回 JSON 时，在项目的 `helper` 目录执行 `npm start`。不要同时启动多个 helper。

### 保存成功但没有日程

确认 helper 正在运行、`lark-cli auth status --json --verify` 登录有效、`lark-cli calendar +freebusy --as user` 可返回数据，并且已经达到 3 篇或设置中的后续数量。还要确认设置的日期和时间范围内有空档。

可在 `chrome://extensions` 点击 Brain food 卡片下的 **service worker** 查看后台日志；helper 终端也会显示飞书错误。

### 时间范围或时区报错

确认 macOS 系统时区正确，并在设置中使用本地时间。插件会使用 Mac 的本地时区向飞书查询和创建日程，不要手动改成 UTC。

### 权限不足

执行：

~~~bash
lark-cli whoami
lark-cli auth status --json --verify
lark-cli auth login --domain docs --domain drive
~~~

如果错误中给出了 `missing_scopes`，按错误提示使用精确 scope 授权。

### 修改代码后仍显示旧版本

打开 `chrome://extensions`，点击 Brain food 卡片的重新加载按钮，再刷新文章页面。侧边栏仍旧时，先关闭再重新打开。

### 回顾文档同步失败

阅读状态会先保存到 Chrome 本地。确认 helper 和飞书云文档权限正常后，再次完成回顾流程即可重试同步。

## 九、更新和卸载

### Git 更新

~~~bash
cd /你的路径/brain-food
git pull origin main
~~~

然后在 `chrome://extensions` 点击 Brain food 的重新加载按钮。更新 helper 代码后，先在 helper 终端按 `Ctrl + C` 停止，再重新执行 `npm start`。

### ZIP 更新

重新下载最新 ZIP，解压到新的目录，在 Chrome 扩展页移除旧的 Brain food，再加载新目录。Chrome 本地阅读列表通常不会因为重新加载代码而丢失。

### 卸载

1. 在 `chrome://extensions` 移除 Brain food。
2. 关闭 helper 终端窗口，或按 `Ctrl + C` 停止。
3. 确认没有需要保留的文件后，删除本地项目目录。
4. 如需清除本机飞书登录状态，执行：

~~~bash
lark-cli auth logout --json
~~~

`auth logout` 只清除本机登录状态；如需撤销飞书服务端授权，还要在飞书授权管理页面单独处理。

## 十、安全注意事项

- 不要把 App Secret、access token 或敏感授权信息提交到 GitHub。
- 不要把 `.env`、密钥文件或本机日志上传到仓库。
- helper 只监听 `127.0.0.1`，不要改成对外网开放。
- 阅读列表和想法默认保存在 Chrome 本地。
- 日历和回顾文档只通过你自己的 `lark-cli` 用户身份访问。

## 十一、项目链接

- GitHub 仓库：[lufan808/brain-food](https://github.com/lufan808/brain-food)
- 直接下载：[main.zip](https://github.com/lufan808/brain-food/archive/refs/heads/main.zip)
- 飞书执行文档：[FEISHU_EXECUTION.md](FEISHU_EXECUTION.md)
