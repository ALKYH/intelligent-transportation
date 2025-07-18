import React, { useState, useEffect, useRef } from "react"
import { Box, Container, Heading, Text, Flex, Input, Button, VStack, HStack } from "@chakra-ui/react"
import { Field } from '../ui/field'

export default function VehicleTrajectory() {
  const [commaddr, setCommaddr] = useState("15053110001")
  const [startDateTime, setStartDateTime] = useState("2013-09-13T12:00:00")
  const [endDateTime, setEndDateTime] = useState("2013-09-13T14:00:00")
  const [loading, setLoading] = useState(false)
  const [trajectoryData, setTrajectoryData] = useState<any[]>([])
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const [showPickupDropoff, setShowPickupDropoff] = useState(true)
  
  // 强制使用BD09坐标系转换
  const coordinateSystem = "BD09"
  const [correctionInfo, setCorrectionInfo] = useState<any>(null)

  // 新增：用于 datetime-local <-> utc 字符串转换
  const formatDateTimeLocal = (utc: string) => {
    if (!utc || utc.length !== 14) return ''
    return `${utc.slice(0,4)}-${utc.slice(4,6)}-${utc.slice(6,8)}T${utc.slice(8,10)}:${utc.slice(10,12)}:${utc.slice(12,14)}`
  }
  const parseDateTimeLocal = (val: string) => {
    if (!val) return ''
    const d = val.replace(/[-:T]/g, '')
    return d.length === 14 ? d : ''
  }

  // 新增转换函数
  function dateTimeLocalToUtc(val: string) {
    if (!val) return ""
    return val.replace(/[-:T]/g, "")
  }

  // 初始化百度地图
  useEffect(() => {
    const initMap = () => {
      if (typeof window !== 'undefined' && window.BMap && mapRef.current) {
        console.log('初始化百度地图...')
        const map = new window.BMap.Map(mapRef.current)
        mapInstanceRef.current = map
        // 设置济南市中心坐标
        const jinanCenter = new window.BMap.Point(117.000923, 36.675807)
        map.centerAndZoom(jinanCenter, 12)
        map.enableScrollWheelZoom(true)
        map.addControl(new window.BMap.NavigationControl())
        map.addControl(new window.BMap.ScaleControl())
        console.log('百度地图初始化完成')
      }
    }

    const loadBaiduMap = () => {
      if (typeof window !== 'undefined' && !window.BMap) {
        console.log('加载百度地图API...')
        const script = document.createElement('script')
        script.src = `https://api.map.baidu.com/api?v=3.0&ak=TtyedSKP6umaE86VQqLbcE1sHS0f65A8&callback=initBaiduMap`
        script.async = true
        document.head.appendChild(script)
        window.initBaiduMap = initMap
      } else {
        console.log('百度地图API已存在，直接初始化')
        initMap()
      }
    }
    
    // 延迟加载地图，确保DOM已渲染
    const timer = setTimeout(() => {
      loadBaiduMap()
    }, 100)
    
    return () => {
      clearTimeout(timer)
    }
  }, [])

  // 清空地图上的所有覆盖物
  const clearMap = () => {
    if (!mapInstanceRef.current) {
      console.log('地图实例不存在，无法清空')
      return
    }
    
    console.log('清空地图覆盖物...')
    
    // 清除之前的轨迹线
    if (polylineRef.current) {
      mapInstanceRef.current.removeOverlay(polylineRef.current)
      polylineRef.current = null
    }
    
    // 清除之前的标记
    markersRef.current.forEach(marker => {
      mapInstanceRef.current.removeOverlay(marker)
    })
    markersRef.current = []
  }

  // 在地图上绘制轨迹
  const drawTrajectoryOnMap = (data: any[]) => {
    console.log('开始绘制轨迹，数据:', data)
    
    if (!mapInstanceRef.current) {
      console.error('地图实例未初始化')
      return
    }
    
    if (!window.BMap) {
      console.error('百度地图API未加载')
      return
    }

    // 清空地图
    clearMap()

    if (data.length === 0) {
      console.log('没有轨迹数据')
      return
    }

    // 检查数据格式
    console.log('第一条数据:', data[0])
    console.log('最后一条数据:', data[data.length - 1])

    // 按 tflag 连续性拆分为多段
    const segments = []
    let currentSegment = []
    let currentFlag = data[0].tflag
    for (let i = 0; i < data.length; i++) {
      if (data[i].tflag === currentFlag) {
        currentSegment.push(data[i])
      } else {
        if (currentSegment.length > 1) segments.push({ tflag: currentFlag, points: [...currentSegment] })
        currentSegment = [data[i]]
        currentFlag = data[i].tflag
      }
    }
    if (currentSegment.length > 1) segments.push({ tflag: currentFlag, points: [...currentSegment] })

    // 绘制每段
    segments.forEach(seg => {
      const points = seg.points.map(record => new window.BMap.Point(record.lon, record.lat))
      const color = seg.tflag === 1 ? "#FF0000" : "#0066FF" // 载客红，空载蓝
      const polyline = new window.BMap.Polyline(points, {
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.8
      })
      mapInstanceRef.current.addOverlay(polyline)

      // 只在每段最后一个点标注（受 showPickupDropoff 控制）
      if (showPickupDropoff) {
        const lastPoint = points[points.length - 1]
        if (seg.tflag === 1) {
          // 载客段，最后一个点为下客点
          const dropoffIcon = new window.BMap.Icon(
            'https://api.iconify.design/mdi:map-marker-check.svg?color=%2300bb00',
            new window.BMap.Size(32, 32),
            { anchor: new window.BMap.Size(16, 32) }
          )
          const marker = new window.BMap.Marker(lastPoint, { icon: dropoffIcon })
          marker.setLabel(new window.BMap.Label('下客点', { offset: new window.BMap.Size(20, -10) }))
          mapInstanceRef.current.addOverlay(marker)
          markersRef.current.push(marker)
        } else {
          // 空载段，最后一个点为上客点
          const pickupIcon = new window.BMap.Icon(
            'https://api.iconify.design/mdi:map-marker-plus.svg?color=%23ff9900',
            new window.BMap.Size(32, 32),
            { anchor: new window.BMap.Size(16, 32) }
          )
          const marker = new window.BMap.Marker(lastPoint, { icon: pickupIcon })
          marker.setLabel(new window.BMap.Label('上客点', { offset: new window.BMap.Size(20, -10) }))
          mapInstanceRef.current.addOverlay(marker)
          markersRef.current.push(marker)
        }
      }
    })

    // 添加起点和终点标记
    if (data.length > 0) {
      const startPoint = new window.BMap.Point(data[0].lon, data[0].lat)
      const endPoint = new window.BMap.Point(data[data.length - 1].lon, data[data.length - 1].lat)
      
      // 使用百度地图内置的默认图标
      const startMarker = new window.BMap.Marker(startPoint)
      const endMarker = new window.BMap.Marker(endPoint)
      
      // 设置不同的图标样式来区分起点和终点
      startMarker.setLabel(new window.BMap.Label("起点", { offset: new window.BMap.Size(20, -10) }))
      endMarker.setLabel(new window.BMap.Label("终点", { offset: new window.BMap.Size(20, -10) }))
      
      mapInstanceRef.current.addOverlay(startMarker)
      mapInstanceRef.current.addOverlay(endMarker)
      markersRef.current.push(startMarker, endMarker)
      console.log('起点和终点标记已添加')

      // 转换速度单位：cm/s -> m/s -> km/h
      const startSpeedMs = (data[0].speed / 100).toFixed(1)
      const startSpeedKmh = (data[0].speed * 0.036).toFixed(1)
      const endSpeedMs = (data[data.length - 1].speed / 100).toFixed(1)
      const endSpeedKmh = (data[data.length - 1].speed * 0.036).toFixed(1)

      // 添加信息窗口
      const startInfo = new window.BMap.InfoWindow(`起点<br/>时间: ${data[0].utc}<br/>速度: ${startSpeedMs}m/s (${startSpeedKmh}km/h)`)
      const endInfo = new window.BMap.InfoWindow(`终点<br/>时间: ${data[data.length - 1].utc}<br/>速度: ${endSpeedMs}m/s (${endSpeedKmh}km/h)`)
      
      startMarker.addEventListener("click", () => {
        mapInstanceRef.current.openInfoWindow(startInfo, startPoint)
      })
      endMarker.addEventListener("click", () => {
        mapInstanceRef.current.openInfoWindow(endInfo, endPoint)
      })
    }

    // 调整地图视野以包含所有轨迹点
    const allPoints = data.map(record => new window.BMap.Point(record.lon, record.lat))
    mapInstanceRef.current.setViewport(allPoints)
    console.log('地图视野已调整')
  }

  const fetchTrajectoryData = async () => {
    if (!commaddr.trim()) {
      alert("请输入车牌号")
      return
    }

    setLoading(true)
    // 清空地图和轨迹数据
    clearMap()
    setTrajectoryData([])
    setCorrectionInfo(null)
    
    try {
      console.log('开始查询轨迹数据...')
      
      // 强制使用矫正数据API
      const apiUrl = `http://localhost:8000/api/v1/analysis/gps-records-corrected?commaddr=${commaddr}&start_utc=${dateTimeLocalToUtc(startDateTime)}&end_utc=${dateTimeLocalToUtc(endDateTime)}&coordinate_system=${coordinateSystem}`
      
      console.log('API URL:', apiUrl)
      const response = await fetch(apiUrl)
      const data = await response.json()
      
      console.log('API响应:', data)
      
      if (data.error) {
        alert(`查询失败: ${data.error}`)
        return
      }
      
      const records = data.records || []
      console.log('轨迹记录数量:', records.length)
      
      setTrajectoryData(records)
      
      // 保存矫正信息
      if (data.correction_info) {
        setCorrectionInfo(data.correction_info)
      }
      
      // 确保地图已初始化后再绘制轨迹
      if (mapInstanceRef.current && window.BMap) {
        console.log('地图已初始化，开始绘制轨迹')
        // 延迟一点时间确保地图完全加载
        setTimeout(() => {
          drawTrajectoryOnMap(records)
        }, 200)
      } else {
        console.error('地图未初始化，无法绘制轨迹')
        console.log('mapInstanceRef.current:', mapInstanceRef.current)
        console.log('window.BMap:', window.BMap)
      }
    } catch (error) {
      console.error('获取轨迹数据失败:', error)
      alert('获取轨迹数据失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxW="full">
      <Heading size="md" mb={4}>车辆轨迹可视化</Heading>
      
      {/* 查询条件 */}
      <VStack gap={4} align="stretch" mb={6}>
        <Field label="车牌号">
          <Input
            value={commaddr}
            onChange={(e) => setCommaddr(e.target.value)}
            placeholder="请输入车牌号"
          />
        </Field>
        
        <HStack gap={4}>
          <Field label="起始时间">
            <Input
              type="datetime-local"
              value={startDateTime}
              onChange={e => setStartDateTime(e.target.value)}
              height={8}
              borderRadius={4}
              border="1px solid #ccc"
              px={2}
              w={52}
            />
          </Field>
          <Field label="结束时间">
            <Input
              type="datetime-local"
              value={endDateTime}
              onChange={e => setEndDateTime(e.target.value)}
              height={8}
              borderRadius={4}
              border="1px solid #ccc"
              px={2}
              w={52}
            />
          </Field>
          <Field label="显示上下客点">
            <input
              type="checkbox"
              checked={showPickupDropoff}
              onChange={e => setShowPickupDropoff(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </Field>
        </HStack>
        
        {/* 坐标系说明 */}
        <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={4}>
          <Text fontWeight="bold" mb={3}>坐标系转换</Text>
          <Text fontSize="sm" color="gray.600">
            自动使用BD09坐标系转换，确保GPS数据与百度地图路网完美匹配
          </Text>
        </Box>
        
        <Button
          colorScheme="blue"
          onClick={fetchTrajectoryData}
          loading={loading}
          loadingText="查询中..."
        >
          查询轨迹
        </Button>
      </VStack>

      {/* 矫正信息显示 */}
      {correctionInfo && (
        <Box bg="blue.50" p={3} borderRadius="md" mb={4}>
          <Text fontWeight="bold" mb={2}>坐标系转换信息：</Text>
          <Text fontSize="sm">
            原始数据点：{correctionInfo.original_count} | 
            坐标系：{correctionInfo.coordinate_system}
          </Text>
        </Box>
      )}

      {/* 地图容器 */}
      <Box 
        ref={mapRef}
        w="100%" 
        h="400px" 
        border="1px solid" 
        borderColor="gray.300" 
        borderRadius="md"
        mb={4}
      />

      {/* 轨迹数据展示 */}
      {/* 图例说明 */}
      <Box mt={4} mb={2} display="flex" alignItems="center" gap={6}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box w="20px" h="6px" bg="#FF0000" borderRadius="sm" border="1px solid #aaa" />
          <Text fontSize="sm">载客</Text>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <Box w="20px" h="6px" bg="#0066FF" borderRadius="sm" border="1px solid #aaa" />
          <Text fontSize="sm">空载</Text>
        </Box>
      </Box>

      {trajectoryData.length > 0 && (
        <Box>
          <Text fontWeight="bold" mb={2}>
            查询结果：共找到 {trajectoryData.length} 条轨迹记录
          </Text>
          
          {/* 轨迹点列表 */}
          <Box maxH="300px" overflowY="auto" border="1px solid" borderColor="gray.200" borderRadius="md" p={4}>
            {trajectoryData.map((record, index) => {
              // 转换速度单位：cm/s -> m/s -> km/h
              const speedMs = (record.speed / 100).toFixed(1)
              const speedKmh = (record.speed * 0.036).toFixed(1)
              
              return (
                <Box key={index} p={2} borderBottom="1px solid" borderColor="gray.100">
                  <Text fontSize="sm">
                    <strong>时间:</strong> {record.utc} | 
                    <strong>位置:</strong> ({record.lat}, {record.lon}) | 
                    <strong>速度:</strong> {speedMs}m/s ({speedKmh}km/h) | 
                    <strong>方向:</strong> {record.head}° | 
                    <strong>状态:</strong> {record.tflag === 1 ? '载客' : '空载'}
                  </Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {/* 空状态 */}
      {!loading && trajectoryData.length === 0 && commaddr && (
        <Text color="gray.500" textAlign="center">
          未找到该车辆在指定时间范围内的轨迹数据
        </Text>
      )}
    </Container>
  )
}

// 声明全局变量
declare global {
  interface Window {
    BMap: any
    initBaiduMap: () => void
  }
} 