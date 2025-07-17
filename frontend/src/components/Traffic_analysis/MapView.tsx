import React, { useEffect, useState } from "react"
import ReactECharts from 'echarts-for-react'
import { Container, Text, Heading } from "@chakra-ui/react"

const jinanPopulation = [
  { name: '历下区', value: 78 },
  { name: '市中区', value: 74 },
  { name: '槐荫区', value: 66 },
  { name: '天桥区', value: 77 },
  { name: '历城区', value: 128 },
  { name: '长清区', value: 62 },
  { name: '章丘区', value: 104 },
  { name: '济阳区', value: 58 },
  { name: '莱芜区', value: 62 },
  { name: '钢城区', value: 24 },
  { name: '平阴县', value: 38 },
  { name: '商河县', value: 60 }
]

const MapView = () => {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapOption, setMapOption] = useState<any>(null)

  useEffect(() => {
    fetch('/assets/jsons/370100_full.json')
      .then(res => res.json())
      .then(geoJson => {
        // 注册地图
        // @ts-ignore
        import('echarts').then(echarts => {
          echarts.registerMap('jinan', geoJson)
          setMapLoaded(true)
          setMapOption({
            title: { text: '济南市地图（各区县人口）', left: 'center' },
            tooltip: {
              trigger: 'item',
              formatter: (params: any) => {
                return `${params.name}<br/>人口：${params.value} 万人`
              }
            },
            visualMap: {
              min: 20,
              max: 130,
              left: 'left',
              top: 'bottom',
              text: ['高', '低'],
              inRange: { color: ['#e0ffff', '#006edd'] },
              show: true
            },
            series: [
              {
                name: '人口',
                type: 'map',
                map: 'jinan',
                roam: false, // 禁止拖动
                label: { show: true },
                data: jinanPopulation
              }
            ]
          })
        })
      })
  }, [])

  return (
    <Container maxW="full" mt={0}>
      <Heading size="md" mb={4}>地图查看</Heading>
      <Text mb={2} fontWeight="bold">济南市地图：</Text>
      {mapLoaded && mapOption ? (
        <ReactECharts style={{height: 500}} option={mapOption} notMerge={true} lazyUpdate={true} />
      ) : (
        <Text>地图加载中...</Text>
      )}
    </Container>
  )
}

export default MapView 