import React, { useEffect, useRef, useState } from "react"
import { Box, Container, Heading, Text, Flex, VStack, HStack } from "@chakra-ui/react"
import { Field } from '../ui/field'
import { Button } from '../ui/button'

export default function PassengerDensityHeatMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [startUtc, setStartUtc] = useState("20130913100000")
  const [endUtc, setEndUtc] = useState("20130913140000")
  // 保存热力图实例
  const heatmapOverlayRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  // 分析状态提示
  const [analyzing, setAnalyzing] = useState(false)
  // 日期时间选择器状态
  const [selectedDateTime, setSelectedDateTime] = useState("2013-09-13T10:00:00")
  const [selectedEndDateTime, setSelectedEndDateTime] = useState("2013-09-13T14:00:00")
  // 动画相关
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [timeSteps, setTimeSteps] = useState<string[]>([])
  const [currentTimeLabel, setCurrentTimeLabel] = useState<string>("")
  const timerRef = useRef<any>(null)
  // eps和min_samples固定
  const [intervalMin, setIntervalMin] = useState("15")

  // 将日期时间转换为UTC时间戳
  const convertDateTimeToUtc = (dateTimeStr: string) => {
    try {
      const date = new Date(dateTimeStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}${month}${day}${hours}${minutes}${seconds}`
    } catch (e) {
      console.error('日期转换失败:', e)
      return startUtc
    }
  }

  // 处理开始日期时间变化
  const handleStartDateTimeChange = (value: string) => {
    setSelectedDateTime(value)
    const utcTimestamp = convertDateTimeToUtc(value)
    setStartUtc(utcTimestamp)
  }

  // 处理结束日期时间变化
  const handleEndDateTimeChange = (value: string) => {
    setSelectedEndDateTime(value)
    const utcTimestamp = convertDateTimeToUtc(value)
    setEndUtc(utcTimestamp)
  }

  // 切分时间区间
  function splitTimeRange(startUtc: string, endUtc: string, intervalMin: number = 15) {
    const result: string[] = []
    let cur = startUtc
    while (cur <= endUtc) {
      result.push(cur)
      // 增加15分钟
      const y = +cur.slice(0,4), m = +cur.slice(4,6)-1, d = +cur.slice(6,8)
      const H = +cur.slice(8,10), M = +cur.slice(10,12), S = +cur.slice(12,14)
      const date = new Date(y, m, d, H, M, S)
      date.setMinutes(date.getMinutes() + intervalMin)
      const next = date.getFullYear().toString().padStart(4,'0') +
        (date.getMonth()+1).toString().padStart(2,'0') +
        date.getDate().toString().padStart(2,'0') +
        date.getHours().toString().padStart(2,'0') +
        date.getMinutes().toString().padStart(2,'0') +
        date.getSeconds().toString().padStart(2,'0')
      cur = next
    }
    return result
  }

  useEffect(() => {
    // 百度地图API初始化
    const initMap = () => {
      if (
        typeof window !== 'undefined' &&
        window.BMap &&
        window.BMapLib &&
        window.BMapLib.HeatmapOverlay
      ) {
        const map = new window.BMap.Map(mapRef.current)
        mapInstanceRef.current = map
        // 设置济南市中心坐标
        const jinanCenter = new window.BMap.Point(117.000923, 36.675807)
        map.centerAndZoom(jinanCenter, 12)
        // 启用滚轮缩放
        map.enableScrollWheelZoom(true)
        // 添加地图控件
        map.addControl(new window.BMap.NavigationControl())
        map.addControl(new window.BMap.ScaleControl())
        map.addControl(new window.BMap.OverviewMapControl())
        map.addControl(new window.BMap.MapTypeControl())
        // 创建热力图实例并保存
        const heatmapOverlay = new window.BMapLib.HeatmapOverlay({
          "radius": 25,
          "visible": true,
          "opacity": 0.6
        })
        map.addOverlay(heatmapOverlay)
        heatmapOverlayRef.current = heatmapOverlay
      }
    }
    // 动态加载百度地图API
    const loadBaiduMap = () => {
      if (typeof window !== 'undefined' && !window.BMap) {
        const script = document.createElement('script')
        script.src = `https://api.map.baidu.com/api?v=3.0&ak=TtyedSKP6umaE86VQqLbcE1sHS0f65A8&callback=initBaiduMap`
        script.async = true
        document.head.appendChild(script)
        window.initBaiduMap = () => {
          // 加载热力图库
          const heatmapScript = document.createElement('script')
          heatmapScript.src = 'https://api.map.baidu.com/library/Heatmap/2.0/src/Heatmap_min.js'
          heatmapScript.onload = initMap
          document.head.appendChild(heatmapScript)
        }
      } else if (window.BMap && window.BMapLib && window.BMapLib.HeatmapOverlay) {
        initMap()
      }
    }
    loadBaiduMap()
    // 清理定时器和热力图引用
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      heatmapOverlayRef.current = null
      mapInstanceRef.current = null
    }
  }, [])

  // 动态轮播主逻辑
  useEffect(() => {
    if (!playing || timeSteps.length === 0) return
    if (currentStep >= timeSteps.length) {
      setPlaying(false)
      setCurrentTimeLabel("")
      return
    }
    const showStep = async () => {
      const curStart = timeSteps[currentStep]
      // 计算15分钟后的结束时间
      const y = +curStart.slice(0,4), m = +curStart.slice(4,6)-1, d = +curStart.slice(6,8)
      const H = +curStart.slice(8,10), M = +curStart.slice(10,12), S = +curStart.slice(12,14)
      const date = new Date(y, m, d, H, M, S)
      date.setMinutes(date.getMinutes() + Number(intervalMin))
      const curEnd = date.getFullYear().toString().padStart(4,'0') +
        (date.getMonth()+1).toString().padStart(2,'0') +
        date.getDate().toString().padStart(2,'0') +
        date.getHours().toString().padStart(2,'0') +
        date.getMinutes().toString().padStart(2,'0') +
        date.getSeconds().toString().padStart(2,'0')
      setCurrentTimeLabel(`${curStart.slice(0,4)}-${curStart.slice(4,6)}-${curStart.slice(6,8)} ${curStart.slice(8,10)}:${curStart.slice(10,12)} ~ ${curEnd.slice(8,10)}:${curEnd.slice(10,12)}`)
      try {
        const res = await fetch(`http://localhost:8000/api/v1/analysis/dbscan-clustering?start_utc=${curStart}&eps=0.001&min_samples=1`)
        const data = await res.json()
        const hotSpots = data.hot_spots || []
        const points = hotSpots.map((spot: any) => ({
          lng: parseFloat(spot.lng),
          lat: parseFloat(spot.lat),
          count: parseInt(spot.count)+30
        })).filter((p: any) => !isNaN(p.lng) && !isNaN(p.lat))
        if (window.BMap && window.BMapLib && window.BMapLib.HeatmapOverlay && heatmapOverlayRef.current) {
          heatmapOverlayRef.current.setDataSet({ data: [], max: 100 })
          heatmapOverlayRef.current.setDataSet({
            data: points,
            max: 100
          })
        }
      } catch (e) {
        // 忽略单步错误
      }
      timerRef.current = setTimeout(() => {
        setCurrentStep(s => s + 1)
      }, 1200)
    }
    showStep()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [playing, currentStep, timeSteps])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setPlaying(false)
    setCurrentStep(0)
    setCurrentTimeLabel("")
    if (timerRef.current) clearTimeout(timerRef.current)
    // 生成所有时间步
    const steps = splitTimeRange(startUtc, endUtc, Number(intervalMin))
    setTimeSteps(steps)
    setPlaying(true)
    setAnalyzing(false)
  }

  return (
    <Container maxW="full">
      <Heading size="md" mb={4}>上客点密度分析</Heading>
      {/* 查询条件 */}
      <VStack gap={4} align="stretch" mb={6}>
        <HStack gap={4}>
          <Field label="起始时间">
            <input
              type="datetime-local"
              value={selectedDateTime}
              onChange={(e) => handleStartDateTimeChange(e.target.value)}
              style={{ 
                height: 32, 
                borderRadius: 4, 
                border: '1px solid #ccc', 
                padding: '0 8px',
                width: 200
              }}
            />
          </Field>
          <Field label="结束时间">
            <input
              type="datetime-local"
              value={selectedEndDateTime}
              onChange={(e) => handleEndDateTimeChange(e.target.value)}
              style={{ 
                height: 32, 
                borderRadius: 4, 
                border: '1px solid #ccc', 
                padding: '0 8px',
                width: 200
              }}
            />
          </Field>
          <Field label="分析间隔(分钟)">
            <input
              type="number"
              min={1}
              value={intervalMin}
              onChange={e => setIntervalMin(e.target.value)}
              style={{ height: 32, borderRadius: 4, border: '1px solid #ccc', padding: '0 8px', width: 100 }}
            />
          </Field>
        </HStack>
        {/* 分析参数说明 */}
        <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={4}>
          <Text fontWeight="bold" mb={3}>分析参数</Text>
          <Text fontSize="sm" color="gray.600">
            使用DBSCAN聚类算法分析热门上客点
          </Text>
        </Box>
        <Button
          colorScheme="blue"
          onClick={handleAnalyze}
          loading={analyzing}
          loadingText="分析中..."
        >
          开始分析
        </Button>
      </VStack>
      {/* 当前时间段显示 */}
      {playing && currentTimeLabel && (
        <Box mb={2} textAlign="center">
          <Text fontWeight="bold" color="blue.600">当前时间段：{currentTimeLabel}</Text>
        </Box>
      )}
      {/* 地图容器 */}
      <Box 
        ref={mapRef}
        w="100%" 
        h="500px" 
        border="1px solid" 
        borderColor="gray.300" 
        borderRadius="md"
        mb={4}
      />
    </Container>
  )
}

// 声明全局变量
declare global {
  interface Window {
    BMap: any
    BMapLib: any
    initBaiduMap: () => void
  }
} 