-- Monochrome HUD script test: feeds the SAME ArduPilot-encoded frames the
-- widget harness uses and expects identical decodes - this is what keeps
-- the copied decoder core in SDBW/SCRIPTS/TELEMETRY/ArduDk.lua from
-- drifting from the widget's. Plus render smokes at 128x64 and 212x64.
-- Run from apps/desktop: lua scripts/test-hud-bw.lua

bit32 = {
  band = function (a, b) return a & b end,
  rshift = function (a, n) return a >> n end,
  btest = function (a, b) return (a & b) ~= 0 end,
}

local stubTime = 0
function getTime() return stubTime end
function getRSSI() return 80 end
function getUsage() return 0 end
local spoken = {}
function playFile(f) spoken[#spoken + 1] = f end
local function spoke(name)
  for _, f in ipairs(spoken) do
    if string.find(f, name, 1, true) then return true end
  end
  return false
end
function playTone() end
function getValue() return nil end
function io.open() return nil end
lcd = setmetatable({
  clear = function () end,
}, { __index = function () return function () end end })
LCD_W, LCD_H = 128, 64
SMLSIZE, MIDSIZE, DBLSIZE, INVERS, BLINK, PLAY_NOW = 1, 2, 4, 8, 16, 0
SOLID, FORCE, RIGHT = 0, 0, 0
EVT_VIRTUAL_NEXT = 97 -- real value so the page-flip smoke actually flips

local frames = {}
function crossfireTelemetryPop()
  local f = table.remove(frames, 1)
  if f then return f[1], f[2] end
  return nil
end

-- Verified frame layout (see test-hud-widget.lua for provenance)
local function pushSingle(appid, value)
  local d = {
    0xF0,
    appid & 0xFF, (appid >> 8) & 0xFF,
    value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF,
  }
  frames[#frames + 1] = { 0x80, d }
end

-- ArduPilot-side encoder (identical copy from test-hud-widget.lua)
local function prep_number(number, digits, power)
  local res = 0
  local abs_number = math.abs(number)
  local function round(x) return math.floor(x + 0.5) end
  if digits == 2 and power == 0 then
    local max_value = number < 0 and ((1 << 6) - 1) or ((1 << 7) - 1)
    res = math.min(abs_number, max_value)
    if number < 0 then res = res | (1 << 6) end
  elseif digits == 2 and power == 1 then
    if abs_number < 100 then res = abs_number << 1
    elseif abs_number < 1270 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0xFF end
    if number < 0 then res = res | (0x1 << 8) end
  elseif digits == 2 and power == 2 then
    if abs_number < 100 then res = abs_number << 2
    elseif abs_number < 1000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 10000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 127000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0x1FF end
    if number < 0 then res = res | (0x1 << 9) end
  elseif digits == 3 and power == 1 then
    if abs_number < 1000 then res = abs_number << 1
    elseif abs_number < 10240 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0x7FF end
    if number < 0 then res = res | (0x1 << 11) end
  elseif digits == 3 and power == 2 then
    if abs_number < 1000 then res = abs_number << 2
    elseif abs_number < 10000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 100000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 1024000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0xFFF end
    if number < 0 then res = res | (0x1 << 12) end
  end
  return res
end

local failures = 0
local function check(name, got, want, tol)
  tol = tol or 0
  if math.abs(got - want) > tol then
    print(string.format('FAIL %-24s got %-10s want %-10s', name, tostring(got), tostring(want)))
    failures = failures + 1
  else
    print(string.format('ok   %-24s %s', name, tostring(got)))
  end
end

local S = assert(loadfile('resources/edgetx/ardudeck-hud/SDBW/SCRIPTS/TELEMETRY/ArduDk.lua'))()
S.init()

local function feed(appid, value)
  pushSingle(appid, value)
  S.background()
end

-- Same fixture values as the widget harness
feed(0x5003, (234 & 0x1FF) | (prep_number(126, 2, 1) << 9) | ((2892 & 0x7FFF) << 17))
local ap = ((5 + 1) & 0x1F) | (1 << 7) | (1 << 8)
ap = ap | (prep_number(math.floor(41 * 0.63), 2, 0) << 19)
ap = ap | ((45 - 19) << 26)
feed(0x5001, ap)
feed(0x5002, 14 | (3 << 4) | (prep_number(8, 2, 1) << 6) | (prep_number(5874, 2, 2) << 22))
feed(0x5004, prep_number(229, 3, 2) | (prep_number(635, 3, 2) << 12) | ((math.floor(156 / 3) & 0x7F) << 25))
feed(0x5005, prep_number(-25, 2, 1) | (prep_number(124, 2, 1) << 9) | ((math.floor(244 / 0.2 + 0.5) & 0x7FF) << 17))
feed(0x5006, (math.floor((-32.4 + 180) / 0.2 + 0.5) & 0x7FF)
  | ((math.floor((12.6 + 90) / 0.2 + 0.5) & 0x3FF) << 11)
  | (prep_number(134, 3, 1) << 21))
feed(0x800, math.floor(42.4411 * 600000 + 0.5))
feed(0x800, math.floor(19.2632 * 600000 + 0.5) | (0x1 << 30))

-- reach V through the script's pump closure (same technique as the widget
-- harness)
local Vfound
for i = 1, 200 do
  local name, val = debug.getupvalue(S.background, i)
  if not name then break end
  if name == 'pump' then
    for j = 1, 200 do
      local n2, v2 = debug.getupvalue(val, j)
      if not n2 then break end
      if n2 == 'handlePassthrough' then
        for k = 1, 200 do
          local n3, v3 = debug.getupvalue(v2, k)
          if not n3 then break end
          if n3 == 'V' then Vfound = v3 break end
        end
      end
    end
  end
end
assert(Vfound, 'could not locate V state table')
local V = Vfound

check('batt voltage', V.voltV, 23.4, 0.05)
check('batt current', V.currA, 12.6, 0.5)
check('batt mah', V.mah, 2892)
check('mode num', V.modeNum, 5)
check('armed', V.armed and 1 or 0, 1)
check('sats', V.sats, 14)
check('fix', V.fix, 3)
check('hdop', V.hdop, 0.8, 0.05)
check('gps alt', V.gpsAltM, 590, 0.1)
check('home dist', V.homeDistM, 229)
check('home bearing', V.homeBearingDeg, 156, 3)
check('vspd', V.vspdMs, -2.5, 0.05)
check('hspd', V.hspdMs, 12.0, 0.05)
check('yaw', V.yawDeg, 244, 0.2)
check('lat', V.lat, 42.4411, 0.0001)
check('lon', V.lon, 19.2632, 0.0001)

-- render smokes: LIVE both pages, ladder, at both B&W resolutions
for _, dims in ipairs({ { 128, 64 }, { 212, 64 } }) do
  LCD_W, LCD_H = dims[1], dims[2]
  local ok1 = pcall(function () S.run(0) end)         -- page 1 LIVE
  local ok2 = pcall(function () S.run(EVT_VIRTUAL_NEXT or 97) end)
  check('run page1 @' .. dims[1] .. 'x64', ok1 and 1 or 0, 1)
  check('run page2 @' .. dims[1] .. 'x64', ok2 and 1 or 0, 1)
end
-- ladder path (telemetry stale)
stubTime = 10000
local okLadder = pcall(function () S.run(0) end)
check('run ladder path', okLadder and 1 or 0, 1)

-- ============ EdgeTX sensor source (ELRS MAVLink2 link) ================
-- No passthrough frame ever arrives on such a link: EdgeTX decodes the
-- telemetry and publishes plain sensors. Names, units and precisions here
-- are the ones a RadioMaster Pocket really created (read back from its
-- MODELS/*.yml), so this fixture is a capture, not an invention.
local SENSORS = {
  RxBt = { unit = 1, value = 23.1 },
  Curr = { unit = 2, value = 11.5 },
  Capa = { unit = 14, value = 1830 },
  ['Bat%'] = { unit = 13, value = 62 },
  Ptch = { unit = 21, value = math.rad(-7) },
  Roll = { unit = 21, value = math.rad(12) },
  Yaw = { unit = 21, value = math.rad(200) },
  VSpd = { unit = 5, value = -1.5 },
  GSpd = { unit = 7, value = 36 },          -- km/h
  GAlt = { unit = 9, value = 123 },
  Sats = { unit = 0, value = 11 },
  GPS = { unit = 40, value = { lat = 42.4411, lon = 19.2632 } },
  FM = { unit = 42, value = 'LOITER*' },
}
local ORDER = { 'RxBt', 'Curr', 'Capa', 'Bat%', 'Ptch', 'Roll', 'Yaw', 'VSpd',
  'GSpd', 'GAlt', 'Sats', 'GPS', 'FM' }

model = {
  getSensor = function (i)
    local n = ORDER[i + 1]
    if n == nil then return { name = '' } end
    return { name = n, unit = SENSORS[n].unit }
  end,
}
function getValue(name)
  local s = SENSORS[name]
  if s == nil then return nil end
  return s.value
end
function getFieldInfo(name) return SENSORS[name] and { id = 1 } or nil end

local drawn = {}
local lines = {}
lcd = setmetatable({
  clear = function () end,
  drawText = function (_, _, t, flags) drawn[#drawn + 1] = { text = tostring(t), flags = flags or 0 } end,
  drawLine = function (x1, y1, x2, y2) lines[#lines + 1] = { x1 = x1, y1 = y1, x2 = x2, y2 = y2 } end,
}, { __index = function () return function () end end })
local function drewText(needle)
  for _, d in ipairs(drawn) do
    if string.find(d.text, needle, 1, true) then return true end
  end
  return false
end

-- size a given row was drawn at, or nil
local function drawnFlags(needle)
  for _, d in ipairs(drawn) do
    if string.find(d.text, needle, 1, true) then return d.flags end
  end
  return nil
end

LCD_W, LCD_H = 128, 64
-- voice comes from background(), which EdgeTX runs whether or not the
-- telemetry screen is open: the checks below never call run()
-- sensor discovery is spread over frames; run enough of them
for i = 1, 20 do
  stubTime = 20000 + i * 100
  S.background()
end

check('sensor volts', V.voltV, 23.1, 0.01)
check('sensor amps', V.currA, 11.5, 0.01)
check('sensor mah', V.mah, 1830)
check('radians -> deg roll', V.rollDeg, 12, 0.01)
check('radians -> deg pitch', V.pitchDeg, -7, 0.01)
check('radians -> deg yaw', V.yawDeg, 200, 0.01)
check('km/h -> m/s', V.hspdMs, 10, 0.01)
check('sensor vspd', V.vspdMs, -1.5, 0.01)
check('sensor alt', V.gpsAltM, 123, 0.01)
check('sensor sats', V.sats, 11)
check('fix from sats', V.fix, 3)
check('source is sensors', V.src == 'snsr' and 1 or 0, 1)
check('mode text', V.modeText == 'LOITER' and 1 or 0, 1)
check('disarmed star', V.armed and 1 or 0, 0)
check('armed is known', V.armedKnown and 1 or 0, 1)
check('home latched here', V.homeDistM, 0, 1)

-- fly 100m north of the latched home: range and bearing are computed on
-- the radio because no home sensor exists
SENSORS.GPS.value = { lat = 42.4411 + 100 / 111320, lon = 19.2632 }
SENSORS.FM.value = 'LOITER'
for i = 1, 4 do
  stubTime = 25000 + i * 100
  S.background()
end
check('computed home dist', V.homeDistM, 100, 2)
check('computed home bearing', V.homeBearingDeg, 180, 2)
check('no star -> armed', V.armed and 1 or 0, 1)

check('speaks on first LIVE', spoke('telemetry_ok') and 1 or 0, 1)

-- battery falling into the critical band must call out from background()
spoken = {}
SENSORS['Bat%'].value = 8
for i = 1, 4 do
  stubTime = 30000 + i * 100
  S.background()
end
check('battery callout w/o screen', spoke('batt_crit') and 1 or 0, 1)

drawn = {}
local okSensorRun = pcall(function () S.run(0) end)
check('run on sensor source', okSensorRun and 1 or 0, 1)
check('ladder does not say NO DATA', drewText('NO DATA') and 1 or 0, 0)
check('mode banner drawn', drewText('LOITER') and 1 or 0, 1)
check('unfillable slot reads --', drewText('--') and 1 or 0, 1)

-- ============ empty neighbour grows the surviving row ==================
-- CFG lives behind loadCfg, same upvalue walk the V lookup uses
local CFG
for i = 1, 200 do
  local n, v = debug.getupvalue(S.init, i)
  if not n then break end
  if n == 'loadCfg' then
    for j = 1, 200 do
      local n2, v2 = debug.getupvalue(v, j)
      if not n2 then break end
      if n2 == 'CFG' then CFG = v2 end
    end
  end
end
assert(CFG, 'could not locate CFG')

CFG.left = { 'curr', 'mah', 'thr', 'yaw' }
drawn = {}
S.run(0)
check('packed column stays small', drawnFlags('11.5A'), SMLSIZE)

-- 11.5A is 5 chars: too wide for DBLSIZE in a 48px column, fits MIDSIZE
CFG.left = { 'curr', 'none', 'mah', 'thr' }
drawn = {}
S.run(0)
check('grows into the empty row', drawnFlags('11.5A'), MIDSIZE)

-- the gap is consumed, not drawn twice
local occurrences = 0
for _, d in ipairs(drawn) do
  if d.text == '11.5A' then occurrences = occurrences + 1 end
end
check('grown row drawn once', occurrences, 1)

-- a filled row below a gap moves up into it
CFG.left = { 'none', 'curr', 'mah', 'thr' }
drawn = {}
S.run(0)
check('row below a gap grows up', drawnFlags('11.5A'), MIDSIZE)

-- the right column is only 32px wide, so growth drops the tag and unit
-- rather than refusing: 'H100m' small becomes '100' at MIDSIZE
CFG.slots = { 'home', 'none', 'alt', 'spd', 'sat' }
drawn = {}
S.run(0)
check('narrow column grows via compact form', drawnFlags('100'), MIDSIZE)
check('long form dropped when grown', drewText('H100m') and 1 or 0, 0)

-- the home arrow takes the height the column did not use
local function arrowSpan()
  local lo, hi = 999, -999
  for _, l in ipairs(lines) do
    -- right-hand column only: the horizon draws lines too
    if l.x1 >= 90 and l.x2 >= 90 then
      lo = math.min(lo, l.y1, l.y2)
      hi = math.max(hi, l.y1, l.y2)
    end
  end
  return hi - lo
end

CFG.slots = { 'alt', 'spd', 'vspd', 'sat', 'home' }
lines = {}
S.run(0)
local packedArrow = arrowSpan()

CFG.slots = { 'alt', 'none', 'none', 'none', 'none' }
lines = {}
S.run(0)
local roomyArrow = arrowSpan()
check('arrow grows into free rows', roomyArrow > packedArrow and 1 or 0, 1)

print(failures == 0 and 'ALL PASS' or (failures .. ' FAILURES'))
os.exit(failures == 0 and 0 or 1)
