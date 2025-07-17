import React, { useEffect, useRef, useState } from "react"
import { Box, Heading, Text, Spinner } from "@chakra-ui/react"

function getColorByLevel(level: string) {
  if (level === "畅通") return "green"
  if (level === "一般") return "yellow"
  return "red"
}

const CongestionStatus = () => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [loading, setLoading] = useState(false)
  const [roads, setRoads] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  // 示例：默认时间范围（可根据实际需求调整或做成可选）
  const start_utc = "20130912000000"
  const end_utc = "20130912010000"

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`http://localhost:8000/api/v1/analysis/road-congestion-status?start_utc=${start_utc}&end_utc=${end_utc}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setRoads(data.roads || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const initMap = () => {
      if (typeof window !== 'undefined' && window.BMap && mapRef.current) {
        const map = new window.BMap.Map(mapRef.current)
        mapInstanceRef.current = map
        const center = new window.BMap.Point(117.130, 36.680)
        map.centerAndZoom(center, 13)
        map.enableScrollWheelZoom(true)
        map.addControl(new window.BMap.NavigationControl())
        map.addControl(new window.BMap.ScaleControl())
        // 绘制路段
        roads.forEach((seg, idx) => {
          const points = [
            new window.BMap.Point(seg.onlon, seg.onlat),
            new window.BMap.Point(seg.offlon, seg.offlat)
          ]
          const color = getColorByLevel(seg.congestion_level)
          const polyline = new window.BMap.Polyline(points, {
            strokeColor: color,
            strokeWeight: 8,
            strokeOpacity: 0.8
          })
          map.addOverlay(polyline)
          // 路段速度+拥堵标签
          const mid = new window.BMap.Point(
            (seg.onlon + seg.offlon) / 2,
            (seg.onlat + seg.offlat) / 2
          )
          const label = new window.BMap.Label(
            `${seg.avg_speed}km/h\n${seg.congestion_level}`,
            { position: mid }
          )
          label.setStyle({ color: "#333", background: "#fff", border: "none", fontSize: "12px" })
          map.addOverlay(label)
        })
      }
    }
    const loadBaiduMap = () => {
      if (typeof window !== 'undefined' && !window.BMap) {
        const script = document.createElement('script')
        script.src = `https://api.map.baidu.com/api?v=3.0&ak=TtyedSKP6umaE86VQqLbcE1sHS0f65A8&callback=initBaiduMap`
        script.async = true
        document.head.appendChild(script)
        window.initBaiduMap = initMap
      } else {
        initMap()
      }
    }
    if (roads.length > 0) {
      setTimeout(() => {
        loadBaiduMap()
      }, 100)
    }
  }, [roads])

  return (
    <Box maxW="full">
      <Heading size="md" mb={4}>道路拥堵状况</Heading>
      <Text mb={2} color="gray.500">根据路段通行速度自动标色，绿色=畅通，黄色=一般，红色=拥堵</Text>
      {loading && <Spinner size="lg" color="blue.500" />}
      {error && <Text color="red.500">{error}</Text>}
      <Box ref={mapRef} w="100%" h="500px" border="1px solid" borderColor="gray.300" borderRadius="md" mb={4} />
    </Box>
  )
}

// 声明全局变量
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.initBaiduMap = window.initBaiduMap || (() => {})
}

export default CongestionStatus 