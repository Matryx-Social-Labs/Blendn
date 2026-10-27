/*
 * The app's one icon set: Lucide, outlined, behind one component.
 *
 * The map is the design system's icon inventory (guidelines/icons: the 105
 * glyphs the flows draw, the amenity set, the tab bar), keyed by Lucide's own
 * names so a frame's annotation (`ic('chevron-left', 24)`) is the code's
 * `<Icon name="chevron-left" />`. One name per glyph: the inventory's aliases
 * (`alert-circle` → `circle-alert`) and Lucide 1.x's renames (`trash-2` →
 * `trash`, `fingerprint` → `fingerprint-pattern`, `circle-help` →
 * `circle-question-mark`, `bar-chart-3` → `chart-column`) are resolved here.
 * A glyph the map lacks is added here, never imported from Lucide at a call
 * site (`scripts/check-design-tokens.js`).
 *
 * Deep imports, one file per glyph: Metro does not tree-shake, and the
 * package root pulls in all ~1,900 icons.
 *
 * Outlined only (DESIGN-BRIEF §8): there is no `fill` prop. A selected or
 * active state changes the container, the colour, or the stroke (`active`:
 * 1.5 → 2.25 at 24pt) — never the glyph's fill.
 */

import type { LucideIcon } from 'lucide-react-native'
import Accessibility from 'lucide-react-native/icons/accessibility'
import Apple from 'lucide-react-native/icons/apple'
import Archive from 'lucide-react-native/icons/archive'
import ArrowDown from 'lucide-react-native/icons/arrow-down'
import ArrowDownUp from 'lucide-react-native/icons/arrow-down-up'
import ArrowLeft from 'lucide-react-native/icons/arrow-left'
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right'
import ArrowUp from 'lucide-react-native/icons/arrow-up'
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import Ban from 'lucide-react-native/icons/ban'
import Beer, { __iconData as beerData } from 'lucide-react-native/icons/beer'
import Bell from 'lucide-react-native/icons/bell'
import BellOff from 'lucide-react-native/icons/bell-off'
import Bookmark from 'lucide-react-native/icons/bookmark'
import Briefcase from 'lucide-react-native/icons/briefcase'
import Calendar from 'lucide-react-native/icons/calendar'
import CalendarCheck from 'lucide-react-native/icons/calendar-check'
import CalendarOff from 'lucide-react-native/icons/calendar-off'
import CalendarX from 'lucide-react-native/icons/calendar-x'
import Camera from 'lucide-react-native/icons/camera'
import CameraOff from 'lucide-react-native/icons/camera-off'
import Car from 'lucide-react-native/icons/car'
import Cat from 'lucide-react-native/icons/cat'
import ChartColumn from 'lucide-react-native/icons/chart-column'
import Check, { __iconData as checkData } from 'lucide-react-native/icons/check'
import CheckCheck from 'lucide-react-native/icons/check-check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronLeft from 'lucide-react-native/icons/chevron-left'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import ChevronUp from 'lucide-react-native/icons/chevron-up'
import Cigarette from 'lucide-react-native/icons/cigarette'
import CircleAlert from 'lucide-react-native/icons/circle-alert'
import CircleCheck, { __iconData as circleCheckData } from 'lucide-react-native/icons/circle-check'
import CirclePause from 'lucide-react-native/icons/circle-pause'
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark'
import CircleSlash from 'lucide-react-native/icons/circle-slash'
import CircleUserRound from 'lucide-react-native/icons/circle-user-round'
import Clock from 'lucide-react-native/icons/clock'
import CloudOff from 'lucide-react-native/icons/cloud-off'
import Coffee, { __iconData as coffeeData } from 'lucide-react-native/icons/coffee'
import Copy from 'lucide-react-native/icons/copy'
import CreditCard from 'lucide-react-native/icons/credit-card'
import Disc3 from 'lucide-react-native/icons/disc-3'
import DoorClosed from 'lucide-react-native/icons/door-closed'
import DoorOpen from 'lucide-react-native/icons/door-open'
import Download from 'lucide-react-native/icons/download'
import Ellipsis from 'lucide-react-native/icons/ellipsis'
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import ExternalLink from 'lucide-react-native/icons/external-link'
import Eye from 'lucide-react-native/icons/eye'
import EyeOff from 'lucide-react-native/icons/eye-off'
import FileText from 'lucide-react-native/icons/file-text'
import FileX from 'lucide-react-native/icons/file-x'
import FingerprintPattern from 'lucide-react-native/icons/fingerprint-pattern'
import Flag from 'lucide-react-native/icons/flag'
import Ghost from 'lucide-react-native/icons/ghost'
import Gift from 'lucide-react-native/icons/gift'
import GraduationCap from 'lucide-react-native/icons/graduation-cap'
import Hand from 'lucide-react-native/icons/hand'
import HandHeart from 'lucide-react-native/icons/hand-heart'
import Heart from 'lucide-react-native/icons/heart'
import HeartOff from 'lucide-react-native/icons/heart-off'
import Hourglass from 'lucide-react-native/icons/hourglass'
import IdCard from 'lucide-react-native/icons/id-card'
import Image from 'lucide-react-native/icons/image'
import Images from 'lucide-react-native/icons/images'
import Info from 'lucide-react-native/icons/info'
import KeyRound from 'lucide-react-native/icons/key-round'
import Link from 'lucide-react-native/icons/link'
import Link2Off from 'lucide-react-native/icons/link-2-off'
import LocateOff from 'lucide-react-native/icons/locate-off'
import Lock from 'lucide-react-native/icons/lock'
import LogOut from 'lucide-react-native/icons/log-out'
import Mail from 'lucide-react-native/icons/mail'
import MailX from 'lucide-react-native/icons/mail-x'
import MapPin from 'lucide-react-native/icons/map-pin'
import MapPinOff from 'lucide-react-native/icons/map-pin-off'
import Martini from 'lucide-react-native/icons/martini'
import Megaphone from 'lucide-react-native/icons/megaphone'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import MessageCircleOff from 'lucide-react-native/icons/message-circle-off'
import MessageSquareDashed from 'lucide-react-native/icons/message-square-dashed'
import MessageSquareOff from 'lucide-react-native/icons/message-square-off'
import MicOff from 'lucide-react-native/icons/mic-off'
import Minus from 'lucide-react-native/icons/minus'
import Moon from 'lucide-react-native/icons/moon'
import Music from 'lucide-react-native/icons/music'
import Music2, { __iconData as music2Data } from 'lucide-react-native/icons/music-2'
import Navigation from 'lucide-react-native/icons/navigation'
import Pause from 'lucide-react-native/icons/pause'
import PenLine from 'lucide-react-native/icons/pen-line'
import Pencil from 'lucide-react-native/icons/pencil'
import Play from 'lucide-react-native/icons/play'
import Plus from 'lucide-react-native/icons/plus'
import Radar from 'lucide-react-native/icons/radar'
import Radio from 'lucide-react-native/icons/radio'
import Rainbow from 'lucide-react-native/icons/rainbow'
import RefreshCw from 'lucide-react-native/icons/refresh-cw'
import Reply from 'lucide-react-native/icons/reply'
import Rocket from 'lucide-react-native/icons/rocket'
import RotateCcw from 'lucide-react-native/icons/rotate-ccw'
import RotateCcwClock from 'lucide-react-native/icons/rotate-ccw-clock'
import Scale from 'lucide-react-native/icons/scale'
import ScanFace from 'lucide-react-native/icons/scan-face'
import Search from 'lucide-react-native/icons/search'
import Send from 'lucide-react-native/icons/send'
import Settings from 'lucide-react-native/icons/settings'
import Settings2 from 'lucide-react-native/icons/settings-2'
import Share from 'lucide-react-native/icons/share'
import Shield from 'lucide-react-native/icons/shield'
import ShieldAlert from 'lucide-react-native/icons/shield-alert'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import ShieldOff from 'lucide-react-native/icons/shield-off'
import Shirt from 'lucide-react-native/icons/shirt'
import Shuffle from 'lucide-react-native/icons/shuffle'
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal'
import Smartphone from 'lucide-react-native/icons/smartphone'
import Sparkles from 'lucide-react-native/icons/sparkles'
import Ticket from 'lucide-react-native/icons/ticket'
import Timer from 'lucide-react-native/icons/timer'
import Toilet from 'lucide-react-native/icons/toilet'
import Trash from 'lucide-react-native/icons/trash'
import Trees from 'lucide-react-native/icons/trees'
import TreePalm from 'lucide-react-native/icons/tree-palm'
import TriangleAlert from 'lucide-react-native/icons/triangle-alert'
import Unlink from 'lucide-react-native/icons/unlink'
import User from 'lucide-react-native/icons/user'
import UserCheck from 'lucide-react-native/icons/user-check'
import UserMinus from 'lucide-react-native/icons/user-minus'
import UserPlus from 'lucide-react-native/icons/user-plus'
import UserRoundPen from 'lucide-react-native/icons/user-round-pen'
import UserX from 'lucide-react-native/icons/user-x'
import Users from 'lucide-react-native/icons/users'
import UsersRound from 'lucide-react-native/icons/users-round'
import Utensils from 'lucide-react-native/icons/utensils'
import Volume2 from 'lucide-react-native/icons/volume-2'
import VolumeX from 'lucide-react-native/icons/volume-x'
import Wifi from 'lucide-react-native/icons/wifi'
import WifiOff from 'lucide-react-native/icons/wifi-off'
import Wind from 'lucide-react-native/icons/wind'
import Wine from 'lucide-react-native/icons/wine'
import Wrench from 'lucide-react-native/icons/wrench'
import X from 'lucide-react-native/icons/x'
import Zap from 'lucide-react-native/icons/zap'
// Foundations (category glyphs, `lib/categoryGlyph.ts`): kept in one block, apart from the alphabetical map above and below.
import Cpu from 'lucide-react-native/icons/cpu'
import Handshake, { __iconData as handshakeData } from 'lucide-react-native/icons/handshake'
import MicVocal from 'lucide-react-native/icons/mic-vocal'
import Mountain, { __iconData as mountainData } from 'lucide-react-native/icons/mountain'
import Palette from 'lucide-react-native/icons/palette'
import Trophy from 'lucide-react-native/icons/trophy'
// Flow 7 / 15 (account row, the Android OS line, a rating that is not open) and Flow 9 (the "you're in" and rate badges): the design's own glyphs.
import AtSign from 'lucide-react-native/icons/at-sign'
import Star from 'lucide-react-native/icons/star'
import StarOff from 'lucide-react-native/icons/star-off'
import { COLOR, ICON } from '../../lib/design/tokens'

const ICONS = {
  accessibility: Accessibility,
  apple: Apple,
  archive: Archive,
  'arrow-down': ArrowDown,
  'arrow-down-up': ArrowDownUp,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up': ArrowUp,
  'arrow-up-right': ArrowUpRight,
  'badge-check': BadgeCheck,
  ban: Ban,
  beer: Beer,
  bell: Bell,
  'bell-off': BellOff,
  bookmark: Bookmark,
  briefcase: Briefcase,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  'calendar-off': CalendarOff,
  'calendar-x': CalendarX,
  camera: Camera,
  'camera-off': CameraOff,
  car: Car,
  cat: Cat,
  'chart-column': ChartColumn,
  check: Check,
  'check-check': CheckCheck,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  cigarette: Cigarette,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-pause': CirclePause,
  'circle-question-mark': CircleQuestionMark,
  'circle-slash': CircleSlash,
  'circle-user-round': CircleUserRound,
  clock: Clock,
  'cloud-off': CloudOff,
  coffee: Coffee,
  copy: Copy,
  'credit-card': CreditCard,
  'disc-3': Disc3,
  'door-closed': DoorClosed,
  'door-open': DoorOpen,
  download: Download,
  ellipsis: Ellipsis,
  'ellipsis-vertical': EllipsisVertical,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  'file-x': FileX,
  'fingerprint-pattern': FingerprintPattern,
  flag: Flag,
  ghost: Ghost,
  gift: Gift,
  'graduation-cap': GraduationCap,
  hand: Hand,
  'hand-heart': HandHeart,
  heart: Heart,
  'heart-off': HeartOff,
  history: RotateCcwClock,
  hourglass: Hourglass,
  'id-card': IdCard,
  image: Image,
  images: Images,
  info: Info,
  'key-round': KeyRound,
  link: Link,
  'link-2-off': Link2Off,
  'locate-off': LocateOff,
  lock: Lock,
  'log-out': LogOut,
  mail: Mail,
  'mail-x': MailX,
  'map-pin': MapPin,
  'map-pin-off': MapPinOff,
  martini: Martini,
  megaphone: Megaphone,
  'message-circle': MessageCircle,
  'message-circle-off': MessageCircleOff,
  'message-square-dashed': MessageSquareDashed,
  'message-square-off': MessageSquareOff,
  'mic-off': MicOff,
  minus: Minus,
  moon: Moon,
  music: Music,
  'music-2': Music2,
  navigation: Navigation,
  pause: Pause,
  'pen-line': PenLine,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  radar: Radar,
  radio: Radio,
  rainbow: Rainbow,
  'refresh-cw': RefreshCw,
  reply: Reply,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  scale: Scale,
  'scan-face': ScanFace,
  search: Search,
  send: Send,
  settings: Settings,
  'settings-2': Settings2,
  share: Share,
  shield: Shield,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  'shield-off': ShieldOff,
  shirt: Shirt,
  shuffle: Shuffle,
  'sliders-horizontal': SlidersHorizontal,
  smartphone: Smartphone,
  sparkles: Sparkles,
  ticket: Ticket,
  timer: Timer,
  toilet: Toilet,
  trash: Trash,
  trees: Trees,
  'tree-palm': TreePalm,
  'triangle-alert': TriangleAlert,
  unlink: Unlink,
  user: User,
  'user-check': UserCheck,
  'user-minus': UserMinus,
  'user-plus': UserPlus,
  'user-round-pen': UserRoundPen,
  'user-x': UserX,
  users: Users,
  'users-round': UsersRound,
  utensils: Utensils,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  wifi: Wifi,
  'wifi-off': WifiOff,
  wind: Wind,
  wine: Wine,
  wrench: Wrench,
  x: X,
  zap: Zap,
  // Foundations: the category glyphs.
  cpu: Cpu,
  handshake: Handshake,
  'mic-vocal': MicVocal,
  mountain: Mountain,
  palette: Palette,
  trophy: Trophy,
  'at-sign': AtSign,
  star: Star,
  'star-off': StarOff,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/**
 * An outlined Lucide glyph. `size` is 16 inline with text, 20 in controls and
 * rows, 24 for navigation (`ICON.inline` / `control` / `nav`). The stroke is
 * 1.5 at 24 and scales with the size (1.25 at 20, 1 at 16), as the tokens
 * say; `active` steps it up to 2.25 at 24 — a supporting cue, never the only
 * one. Decorative: the control around it carries the label.
 */
export function Icon({
  name,
  size = ICON.nav,
  color = COLOR.textPrimary,
  active = false,
}: {
  name: IconName
  size?: number
  color?: string
  active?: boolean
}) {
  const Glyph = ICONS[name]
  return <Glyph size={size} color={color} strokeWidth={active ? ICON.strokeActive : ICON.stroke} />
}

/**
 * The geometry of the glyphs that draw themselves (`Glyph.tsx`, the `draw` verb): read here, beside the map, because
 * `lucide-react-native` belongs to this file alone.
 */
export const DRAW_NODES = {
  beer: beerData.node,
  check: checkData.node,
  'circle-check': circleCheckData.node,
  coffee: coffeeData.node,
  'music-2': music2Data.node,
  handshake: handshakeData.node,
  mountain: mountainData.node,
} as const
