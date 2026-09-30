import {
  IconBrandChrome,
  IconBrandDingtalk,
  IconBrandDiscord,
  IconBrandLine,
  IconBrandMatrix,
  IconBrandQq,
  IconBrandSlack,
  IconBrandTelegram,
  IconBrandWechat,
  IconBrandWhatsapp,
  IconCamera,
  IconMessages,
  IconRobot,
} from "@tabler/icons-react"
import * as React from "react"

import { IconLark } from "@/components/channels/lark-icon"

/**
 * Channel name → icon component map, shared by the channel nav group and the
 * sessions sidebar group. This module intentionally exports only this constant
 * (no component definitions) so react-refresh does not flag it.
 */
export const CHANNEL_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  telegram: IconBrandTelegram,
  discord: IconBrandDiscord,
  slack: IconBrandSlack,
  feishu: IconLark,
  dingtalk: IconBrandDingtalk,
  line: IconBrandLine,
  qq: IconBrandQq,
  weixin: IconBrandWechat,
  wecom: IconBrandWechat,
  whatsapp: IconBrandWhatsapp,
  whatsapp_native: IconBrandWhatsapp,
  matrix: IconBrandMatrix,
  maixcam: IconCamera,
  onebot: IconRobot,
  pico: IconBrandChrome,
  irc: IconMessages,
}
