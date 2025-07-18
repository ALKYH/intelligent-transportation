import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink, useRouter } from "@tanstack/react-router"
import { FiBriefcase, FiHome, FiSettings, FiUsers, FiChevronDown, FiChevronRight, FiMap, FiUser, FiBarChart2 } from "react-icons/fi"
import type { IconType } from "react-icons/lib"
import React, { useState } from "react"

import type { UserPublic } from "@/client"

const items = [
  { icon: FiUser, title: "人脸识别", path: "/face-recognition" },
  { icon: FiMap, title: "路面检测", path: "/road-detection" },
  { icon: FiBarChart2, title: "交通数据分析", path: "/traffic-analysis" },
  { icon: FiSettings, title: "设置", path: "/settings" },
]

interface SidebarItemsProps {
  onClose?: () => void
}

interface Item {
  icon: IconType
  title: string
  path: string
}

const trafficAnalysisSubItems = [
  { title: "上客点密度分析", tab: "pickup-density" },
  { title: "车辆轨迹可视化", tab: "vehicle-trajectory" },
  { title: "统计数据", tab: "statistics" },
  { title: "地图查看", tab: "map-view" },
]

const warningSubItems = [
  { title: "人脸检测告警", path: "/warning/face" },
  { title: "路面检测告警", path: "/warning/road" },
]

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const router = useRouter()
  const currentPath = router.state.location.pathname
  const currentTab = router.state.location.search?.tab
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)

  const finalItems: Item[] = currentUser?.is_superuser
    ? [...items, { icon: FiUsers, title: "Admin", path: "/admin" }]
    : items

  const handleExpand = (title: string) => {
    setExpandedMenu(prev => (prev === title ? null : title))
  }

  const listItems = finalItems.flatMap(({ icon, title, path }, idx, arr) => {
    // 在“设置”菜单项前插入“告警信息”菜单项
    if (title === "设置") {
      return [
        // 告警信息菜单项
        <Box key="warning-menu">
          <Flex
            gap={4}
            px={4}
            py={2}
            alignItems="center"
            fontSize="sm"
            cursor="pointer"
            _hover={{ background: "gray.subtle" }}
            onClick={() => handleExpand("告警信息")}
          >
            <Icon as={FiBriefcase} alignSelf="center" />
            <Text ml={2} userSelect="none">告警信息</Text>
            <Icon as={expandedMenu === "告警信息" ? FiChevronDown : FiChevronRight} ml="auto" />
          </Flex>
          {expandedMenu === "告警信息" && (
            <Box pl={12} mt={1}>
              {warningSubItems.map((sub, idx) => (
                <RouterLink
                  key={sub.path}
                  to={sub.path}
                  onClick={onClose}
                  style={{ display: "block" }}
                >
                  <Text
                    py={1}
                    mb={idx !== warningSubItems.length - 1 ? 2 : 0}
                    color={currentPath === sub.path ? "blue.500" : "gray.700"}
                    fontWeight={currentPath === sub.path ? "bold" : "normal"}
                    fontSize="sm"
                    _hover={{ color: "blue.600" }}
                    userSelect="none"
                  >
                    {sub.title}
                  </Text>
                </RouterLink>
              ))}
            </Box>
          )}
        </Box>,
        // 设置菜单项
        <RouterLink key={title} to={path} onClick={onClose}>
          <Flex
            gap={4}
            px={4}
            py={2}
            _hover={{ background: "gray.subtle" }}
            alignItems="center"
            fontSize="sm"
          >
            <Icon as={icon} alignSelf="center" />
            <Text ml={2}>{title}</Text>
          </Flex>
        </RouterLink>
      ]
    }
    // 其他菜单项
    if (title === "交通数据分析") {
      return (
        <Box key={title}>
          <Flex
            gap={4}
            px={4}
            py={2}
            alignItems="center"
            fontSize="sm"
            cursor="pointer"
            _hover={{ background: "gray.subtle" }}
            onClick={() => handleExpand(title)}
          >
            <Icon as={icon} alignSelf="center" />
            <Text ml={2} userSelect="none">{title}</Text>
            <Icon as={expandedMenu === title ? FiChevronDown : FiChevronRight} ml="auto" />
          </Flex>
          {expandedMenu === title && (
            <Box pl={12} mt={1}>
              {trafficAnalysisSubItems.map((sub, idx) => (
                <RouterLink
                  key={sub.tab}
                  to={`/traffic-analysis?tab=${sub.tab}`}
                  onClick={onClose}
                  style={{ display: "block" }}
                >
                  <Text
                    py={1}
                    mb={idx !== trafficAnalysisSubItems.length - 1 ? 2 : 0}
                    color={currentTab === sub.tab ? "blue.500" : "gray.700"}
                    fontWeight={currentTab === sub.tab ? "bold" : "normal"}
                    fontSize="sm"
                    _hover={{ color: "blue.600" }}
                    userSelect="none"
                  >
                    {sub.title}
                  </Text>
                </RouterLink>
              ))}
            </Box>
          )}
        </Box>
      )
    }
    return [
      <RouterLink key={title} to={path} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{ background: "gray.subtle" }}
          alignItems="center"
          fontSize="sm"
        >
          <Icon as={icon} alignSelf="center" />
          <Text ml={2}>{title}</Text>
        </Flex>
      </RouterLink>
    ]
  })

  return (
    <>
      {/* <Text fontSize="xs" px={4} py={2} fontWeight="bold">
        Menu
      </Text> */}
      <Box>{listItems}</Box>
    </>
  )
}

export default SidebarItems
