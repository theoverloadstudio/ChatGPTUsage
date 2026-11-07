ObjC.import('AppKit')

const WIDTH = 336
const HEIGHT = 365
const UPDATE_HEIGHT = 54
const STATUS_WIDTH = 70
const ASSET_NAME = 'ChatGPTUsage'
const INTERVAL = 120
const label = () => $.NSColor.labelColor
const secondary = () => $.NSColor.secondaryLabelColor
const accent = () => $.NSColor.systemGreenColor
const aheadColor = () => $.NSColor.systemOrangeColor
const nowSeconds = () => Date.now() / 1000
const nil = null
let app, item, target, panel, statusText, footerText, refreshButton, refreshTimer
let cards = {}, windows = {}, client = null, phase = 'loading', updateTime = 0
let lastAttempt = 0, lastResetAttempt = '', supportMessage = ''
let checkButton, updateMessage, releaseButton, releaseURL, updateRequest

function rect(x, y, w, h) { return $.NSMakeRect(x,y,w,h) }
function rounded(x,y,w,h,r,c) {
  if (w <= 0 || h <= 0) return
  c.setFill
  $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect(x,y,w,h),r,r).fill
}
function drawText(s,x,y,size,color,weight) {
  const attrs = $.NSMutableDictionary.alloc.init
  attrs.setObjectForKey($.NSFont.systemFontOfSizeWeight(size,weight), $.NSFontAttributeName)
  attrs.setObjectForKey(color, $.NSForegroundColorAttributeName)
  const value = $(s)
  const w = value.sizeWithAttributes(attrs).width
  value.drawAtPointWithAttributes($.NSMakePoint(x - w/2,y),attrs)
}

function drawBar(x,y,w,h,m,ink,isOld) {
  const radius = Math.min(3,h/2)
  rounded(x,y,w,h,radius,ink.colorWithAlphaComponent(0.13))
  if (!m || m.past) return
  const tone = isOld ? ink.colorWithAlphaComponent(0.4) :
    m.used >= 0.999 ? $.NSColor.systemRedColor : m.ahead ? aheadColor() : accent()
  rounded(x,y,w*m.used,h,Math.min(radius,w*m.used/2),tone)
  if (m.elapsed !== null) {
    const px = Math.max(x+1,Math.min(x+w-1,x+w*m.elapsed))
    rounded(px-0.65,y-2,1.3,h+4,0.6,ink)
  }
}
function statusImage() {
  const img = $.NSImage.alloc.initWithSize($.NSMakeSize(STATUS_WIDTH,24))
  img.template = true
  img.lockFocus
  try {
    const ink = $.NSColor.blackColor
    const now = nowSeconds()
    for (const [key,x,title] of [['week',1,'Week'],['session',38,'Session']]) {
      const width = 31
      const m = measure(windows[key],now)
      rounded(x,14,width,5,2,ink.colorWithAlphaComponent(0.28))
      if (m && !m.past) {
        const fill = width * m.used
        rounded(x,14,fill,5,Math.min(2,fill/2),ink.colorWithAlphaComponent(phase === 'stale' ? 0.35 : 0.75))
        if (m.elapsed !== null) {
          const tick = x + 0.75 + (width - 1.5) * m.elapsed
          rounded(tick-0.75,12.5,1.5,8,0.65,ink)
        }
      }
      drawText(title,x+width/2,1,9,ink,$.NSFontWeightSemibold)
    }
  } finally { img.unlockFocus }
  return img
}

function field(parent,x,y,w,h,size,weight,color,value,align) {
  const f = $.NSTextField.labelWithString(value)
  f.frame = rect(x,y,w,h)
  f.font = $.NSFont.systemFontOfSizeWeight(size,weight)
  f.textColor = color
  if (align) f.alignment = align
  parent.addSubview(f)
  return f
}
function button(parent,title,action,x,y,w,key) {
  const b = $.NSButton.buttonWithTitleTargetAction(title,target,action)
  b.bezelStyle = $.NSBezelStyleRounded
  b.controlSize = $.NSControlSizeSmall
  b.frame = rect(x,y,w,23)
  if (key) b.keyEquivalent = key
  parent.addSubview(b)
  return b
}
function card(root,key,title,y) {
  const box = $.NSBox.alloc.initWithFrame(rect(16,y,304,92))
  box.boxType = $.NSBoxCustom
  box.borderWidth = 0
  box.cornerRadius = 12
  box.fillColor = $.NSColor.labelColor.colorWithAlphaComponent(0.052)
  box.contentViewMargins = $.NSMakeSize(0,0)
  root.addSubview(box)
  const body = box.contentView
  field(body,12,62,125,18,13,$.NSFontWeightSemibold,label(),title)
  const use = field(body,140,62,152,18,13,$.NSFontWeightSemibold,label(),'—',$.NSTextAlignmentRight)
  const bar = $.NSImageView.alloc.initWithFrame(rect(12,40,280,16))
  bar.setAccessibilityElement(false)
  body.addSubview(bar)
  const time = field(body,12,16,280,15,11,$.NSFontWeightMedium,secondary(),'')
  const reset = field(body,12,3,280,14,10,$.NSFontWeightRegular,secondary(),'')
  cards[key] = {use,bar,time,reset}
}

function refreshDisplay() {
  item.button.image = statusImage()
  const n = nowSeconds()
  const tooltip = []
  for (const [k,title] of [['week','Week'],['session','Session']]) {
    const c = cards[k], w = windows[k], m = measure(w,n)
    let used = '—', time = '', reset = ''
    if (!m) {
      time = phase === 'loading' ? 'Checking your limit…' :
        (phase === 'failed' ? 'Usage unavailable' : 'No limit reported for this window')
      tooltip.push(title + ': ' + time)
    } else if (m.past) {
      time = 'Reset time passed · waiting for an update'
      reset = 'Last reported: ' + whole(m.used) + ' used'
      tooltip.push(title + ': waiting for reset confirmation')
    } else {
      used = whole(m.used) + ' used'
      time = m.seconds === null ? 'Reset time unavailable' : timeLeft(m.seconds) + ' until reset · ' + whole(1-m.elapsed) + ' of time left'
      if (m.seconds !== null) {
        const date = new Date(w.resetsAt*1000)
        const text = new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}).format(date)
        reset = 'Resets ' + text
      }
      tooltip.push(title + ': ' + used + (m.seconds === null ? '' : ', ' + timeLeft(m.seconds) + ' until reset'))
    }
    c.use.stringValue = used
    c.time.stringValue = time
    c.reset.stringValue = reset
    const img = $.NSImage.alloc.initWithSize($.NSMakeSize(280,16))
    img.lockFocus
    try { drawBar(0,4,280,8,m,label(),phase === 'stale') } finally { img.unlockFocus }
    c.bar.image = img
  }
  const states = {
    live:['LIVE',accent()], loading:['CHECKING',secondary()],
    stale:['STALE',aheadColor()], failed:['OFFLINE',secondary()]
  }
  statusText.stringValue = states[phase][0]
  statusText.textColor = states[phase][1]
  if (supportMessage) footerText.stringValue = supportMessage
  else if (updateTime) {
    const age = n-updateTime
    footerText.stringValue = age < 60 ? 'Updated just now' : 'Updated ' + timeLeft(age) + ' ago'
  } else footerText.stringValue = 'Using your Codex sign-in'
  item.button.toolTip = tooltip.join('\n') + (phase === 'stale' ? '\nLast successful reading' : '')
  item.button.setAccessibilityLabel(ASSET_NAME + '. ' + tooltip.join('. '))
  refreshButton.enabled = !client
}

function executable() {
  const fm = $.NSFileManager.defaultManager
  const home = ObjC.unwrap($.NSHomeDirectory())
  const cli = '/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
  const bundle = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier('com.openai.codex')
  const installed = bundle && !bundle.isNil() ? ObjC.unwrap(bundle.path) + cli : ''
  return [installed,'/Applications/ChatGPT.app'+cli,'/Applications/Codex.app'+cli,
    home+'/Applications/ChatGPT.app'+cli,home+'/Applications/Codex.app'+cli,
    '/opt/homebrew/bin/codex','/usr/local/bin/codex',home+'/.local/bin/codex']
    .find(p => p && fm.isExecutableFileAtPath(p))
}
function refresh() {
  if (client) return
  lastAttempt = nowSeconds()
  supportMessage = ''
  if (!updateTime) phase = 'loading'
  let path
  try { path = executable() } catch (_) {}
  if (!path) {
    fail('Install ChatGPT for Mac or the Codex CLI.')
    return
  }
  const task = $.NSTask.alloc.init
  task.executableURL = $.NSURL.fileURLWithPath(path)
  task.arguments = ['app-server']
  task.currentDirectoryURL = $.NSURL.fileURLWithPath(ObjC.unwrap($.NSHomeDirectory()))
  const stdin = $.NSPipe.pipe, stdout = $.NSPipe.pipe
  task.standardInput = stdin
  task.standardOutput = stdout
  task.standardError = $.NSFileHandle.fileHandleWithNullDevice
  const read = stdout.fileHandleForReading, write = stdin.fileHandleForWriting
  const center = $.NSNotificationCenter.defaultCenter
  try {
    if (!task.launchAndReturnError(nil)) { fail('Couldn’t start Codex.'); return }
    client = {task,read,write,buf:'',carry:$.NSMutableData.data}
    center.addObserverSelectorNameObject(target,'receive:',$.NSFileHandleReadCompletionNotification,read)
    client.deadline = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(18,target,'timeout:',nil,false)
    $.NSRunLoop.mainRunLoop.addTimerForMode(client.deadline,$.NSRunLoopCommonModes)
    read.readInBackgroundAndNotify
    send({method:'initialize',id:0,params:{clientInfo:{name:'chatgpt_usage',title:ASSET_NAME,version:'1.0.1'}}})
    refreshDisplay()
  } catch (_) { fail('Couldn’t connect to Codex.') }
}
function send(message) {
  client.write.writeDataError($(JSON.stringify(message)+'\n').dataUsingEncoding($.NSUTF8StringEncoding),nil)
}
function stop() {
  if (!client) return
  const old = client
  client = null
  if (old.deadline) old.deadline.invalidate
  $.NSNotificationCenter.defaultCenter.removeObserverNameObject(target,$.NSFileHandleReadCompletionNotification,old.read)
  try { old.write.closeFile } catch (_) {}
  try { if (old.task.running) old.task.terminate } catch (_) {}
  try { old.read.closeFile } catch (_) {}
}
function fail(message) {
  stop()
  phase = updateTime ? 'stale' : 'failed'
  supportMessage = message
  refreshDisplay()
}
function receive(note) {
  if (!client) return
  const data = note.userInfo.objectForKey($.NSFileHandleNotificationDataItem)
  if (!data.length) { fail('Couldn’t read limits. Check your Codex sign-in.'); return }
  client.carry.appendData(data)
  const chunk = $.NSString.alloc.initWithDataEncoding(client.carry,$.NSUTF8StringEncoding)
  if (!chunk.isNil()) {
    client.carry.setLength(0)
    client.buf += ObjC.unwrap(chunk)
    const lines = client.buf.split('\n')
    client.buf = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      const reply = JSON.parse(line)
      if (reply.id === 0) {
        if (!reply.result) { fail('Codex couldn’t start a usage session.'); return }
        send({method:'initialized',params:{}})
        send({method:'account/rateLimits/read',id:1})
      } else if (reply.id === 1) {
        if (!reply.result) {
          const msg = (reply.error?.message || '').toLowerCase()
          const auth = /log ?in|sign ?in|auth|401/.test(msg)
          fail(auth ? 'Sign in to Codex with your ChatGPT account.' : 'Couldn’t fetch limits. Try Refresh.')
          return
        }
        windows = decodeLimits(reply.result)
        updateTime = nowSeconds()
        phase = 'live'
        supportMessage = ''
        stop()
        refreshDisplay()
        return
      }
    }
  }
  if (client) client.read.readInBackgroundAndNotify
}
function tick() {
  const n = nowSeconds()
  const resetKey = Object.values(windows).map(w => w?.resetsAt).filter(t => t && t <= n).join(',')
  if (!client && (n-lastAttempt >= INTERVAL || (resetKey && resetKey !== lastResetAttempt && n-lastAttempt >= 8))) {
    lastResetAttempt = resetKey
    refresh()
  } else refreshDisplay()
}
function showPanel(nearMenuBar) {
  refreshDisplay()
  if (!panel.visible) {
    if (nearMenuBar) {
      const anchor = item.button.window
      const menu = anchor.frame
      const screen = anchor.screen.visibleFrame
      const frame = panel.frame
      const x = Math.max(screen.origin.x, Math.min(menu.origin.x + menu.size.width/2 - frame.size.width/2,
        screen.origin.x + screen.size.width - frame.size.width))
      panel.setFrameTopLeftPoint($.NSMakePoint(x, screen.origin.y + screen.size.height - 6))
    } else {
      panel.center
    }
  }
  app.activateIgnoringOtherApps(true)
  panel.makeKeyAndOrderFront(target)
  if (!client && nowSeconds()-lastAttempt >= 30) refresh()
}

function installedVersion() {
  return ObjC.unwrap($.NSBundle.mainBundle.objectForInfoDictionaryKey('CFBundleShortVersionString'))
}

function showUpdateResult(result) {
  releaseURL = result.url
  updateMessage.stringValue = result.message
  releaseButton.hidden = !releaseURL
  checkButton.enabled = true
}

function checkForUpdates() {
  if (updateRequest) return
  updateMessage.stringValue = 'Checking GitHub for updates…'
  releaseButton.hidden = true
  releaseURL = null
  checkButton.enabled = false

  const files = $.NSFileManager.defaultManager
  const dir = ObjC.unwrap($.NSTemporaryDirectory()) + 'ChatGPTUsage-' + ObjC.unwrap($.NSUUID.UUID.UUIDString)
  const path = dir + '/response'
  let output
  try {
    if (!files.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir,false,$({NSFilePosixPermissions:448}),nil)) {
      throw Error('Couldn’t create the response directory.')
    }
    const task = $.NSTask.alloc.init
    updateRequest = {task,dir,path}
    if (!files.createFileAtPathContentsAttributes(path,$.NSData.data,$.NSDictionary.dictionary)) {
      throw Error('Couldn’t create the response file.')
    }
    output = $.NSFileHandle.fileHandleForWritingAtPath(path)
    task.executableURL = $.NSURL.fileURLWithPath('/usr/bin/curl')
    task.arguments = ['-q','--silent','--max-time','12','--max-filesize','2097152',
      '--header','Accept: application/vnd.github+json',
      '--user-agent',ASSET_NAME,'--write-out','\n%{http_code}',LATEST_RELEASE_API]
    task.standardOutput = output
    task.standardError = $.NSFileHandle.fileHandleWithNullDevice
    if (!task.launchAndReturnError(nil)) throw Error('Couldn’t launch update request.')
    const timer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.25,target,'finishUpdateCheck:',nil,true)
    updateRequest.timer = timer
    $.NSRunLoop.mainRunLoop.addTimerForMode(timer,$.NSRunLoopCommonModes)
  } catch (_) {
    stopUpdateCheck()
    showUpdateResult({message:'Couldn’t start the update check. Try again.'})
  } finally {
    if (output && !output.isNil()) output.closeFile
  }
}

function stopUpdateCheck() {
  if (!updateRequest) return
  const {task,dir,timer} = updateRequest
  updateRequest = null
  if (timer) timer.invalidate
  if (task.running) task.terminate
  $.NSFileManager.defaultManager.removeItemAtPathError(dir,nil)
}

function finishUpdateCheck() {
  if (!updateRequest || updateRequest.task.running) return
  const {task,path} = updateRequest
  let result = {message:'Couldn’t reach GitHub. Try again.'}
  try {
    if (Number(task.terminationStatus) === 0) {
      const output = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path,$.NSUTF8StringEncoding,nil))
      result = releaseStatus(output || '',installedVersion())
    }
  } finally {
    stopUpdateCheck()
    showUpdateResult(result)
  }
}

function method(types,implementation) { return {types,implementation} }

ObjC.registerSubclass({name:'ChatGPTUsageController',methods:{
  'toggle:':method(['void',['id']],function(){
    if (panel.visible) panel.orderOut(target)
    else showPanel(true)
  }),
  'reopen:reply:':method(['void',['id','id']],function(){ showPanel(false) }),
  'tick:':method(['void',['id']],function(){ tick() }),
  'receive:':method(['void',['id']],function(n){ try { receive(n) } catch (_) { fail('Codex returned an unreadable response.') } }),
  'timeout:':method(['void',['id']],function(){ fail('Codex took too long to respond. Try Refresh.') }),
  'refresh:':method(['void',['id']],function(){ refresh() }),
  'checkForUpdates:':method(['void',['id']],function(){ checkForUpdates() }),
  'finishUpdateCheck:':method(['void',['id']],function(){ finishUpdateCheck() }),
  'openRelease:':method(['void',['id']],function(){
    if (releaseURL) $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString(releaseURL))
  }),
  'dashboard:':method(['void',['id']],function(){ $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('https://chatgpt.com/codex/settings/usage')) }),
  'quit:':method(['void',['id']],function(){ stopUpdateCheck(); stop(); app.terminate(target) })
}})

function run() {
  app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)
  target = $.ChatGPTUsageController.alloc.init
  const content = $.NSView.alloc.initWithFrame(rect(0,0,WIDTH,HEIGHT + UPDATE_HEIGHT))
  const root = $.NSView.alloc.initWithFrame(rect(0,UPDATE_HEIGHT,WIDTH,HEIGHT))
  content.addSubview(root)
  field(root,18,340,200,13,10,$.NSFontWeightSemibold,secondary(),'CHATGPT  /  CODEX')
  field(root,18,306,245,30,25,$.NSFontWeightSemibold,label(),ASSET_NAME)
  statusText = field(root,244,319,74,16,10,$.NSFontWeightBold,secondary(),'CHECKING',$.NSTextAlignmentRight)
  card(root,'week','Week',205)
  card(root,'session','Session',104)
  field(root,18,77,300,17,11,$.NSFontWeightMedium,secondary(),'Fill = quota used   ·   Tick = time elapsed')
  field(root,18,42,300,15,10,$.NSFontWeightRegular,secondary(),'Click Week / Session in the menu bar to open this panel.')
  footerText = field(root,18,58,300,15,10,$.NSFontWeightRegular,secondary(),'')
  refreshButton = button(root,'Refresh','refresh:',15,18,74,'r')
  button(root,'Usage Dashboard ↗','dashboard:',94,18,139,'')
  button(root,'Quit','quit:',265,18,55,'q')
  const separator = $.NSBox.alloc.initWithFrame(rect(18,UPDATE_HEIGHT,300,1))
  separator.boxType = $.NSBoxSeparator
  content.addSubview(separator)
  updateMessage = field(content,18,30,300,16,11,$.NSFontWeightRegular,secondary(),
    'Installed version ' + installedVersion())
  checkButton = button(content,'Check for Updates','checkForUpdates:',15,5,145,'')
  releaseButton = button(content,'View Release ↗','openRelease:',179,5,142,'')
  releaseButton.hidden = true
  const style = Number($.NSWindowStyleMaskTitled) | Number($.NSWindowStyleMaskClosable)
  panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(content.frame,style,$.NSBackingStoreBuffered,false)
  panel.title = ASSET_NAME
  panel.contentView = content
  panel.releasedWhenClosed = false
  panel.hidesOnDeactivate = true
  item = $.NSStatusBar.systemStatusBar.statusItemWithLength(STATUS_WIDTH)
  item.autosaveName = 'ChatGPTUsage'
  item.button.imagePosition = $.NSImageOnly
  item.button.target = target
  item.button.action = 'toggle:'
  // LaunchServices sends the 'aevt'/'rapp' event when Finder opens an already running app.
  $.NSAppleEventManager.sharedAppleEventManager.setEventHandlerAndSelectorForEventClassAndEventID(
    target,'reopen:reply:',0x61657674,0x72617070)
  showPanel(false)
  refreshTimer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(5,target,'tick:',nil,true)
  $.NSRunLoop.mainRunLoop.addTimerForMode(refreshTimer,$.NSRunLoopCommonModes)
  refresh()
}
