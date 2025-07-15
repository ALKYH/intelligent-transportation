import { useEffect, useState } from "react"
import ReactECharts from 'echarts-for-react'
import { Text, Flex, Input } from "@chakra-ui/react"
import { Field } from '../ui/field'
import { RadioGroup, Radio } from '../ui/radio'
import { Button } from '../ui/button'

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateParam(date: string) {
  return date.replace(/-/g, '')
}

export default function PassengerCountChart() {
  const [statData, setStatData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [interval, setInterval] = useState<'15min' | '1h'>('15min')
  const [date, setDate] = useState(formatDate(new Date('2013-09-12')))
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapOption, setMapOption] = useState<any>(null)
  const [distanceData, setDistanceData] = useState<any>(null)
  const [occupiedTaxiData, setOccupiedTaxiData] = useState<any[]>([])
  const [occupiedTaxiLoading, setOccupiedTaxiLoading] = useState(false)
  const [chartType, setChartType] = useState<'passenger' | 'taxi'>('passenger')

  useEffect(() => {
    setLoading(true)
    fetch(`http://localhost:8000/api/v1/analysis/passenger-count-distribution?interval=${interval}&date=${formatDateParam(date)}`)
      .then(res => res.json())
      .then(data => setStatData(data))
      .catch(() => setStatData([]))
      .finally(() => setLoading(false))
  }, [interval, date])

  useEffect(() => {
    if (!date) return;
    fetch(`http://localhost:8000/api/v1/analysis/distance-distribution?date=${formatDateParam(date)}`)
      .then(res => res.json())
      .then(data => setDistanceData(data.distance_distribution))
      .catch(() => setDistanceData(null))
  }, [date])

  useEffect(() => {
    setOccupiedTaxiLoading(true)
    fetch(`http://localhost:8000/api/v1/analysis/occupied-taxi-count-distribution?interval=${interval}&date=${formatDateParam(date)}`)
      .then(res => res.json())
      .then(data => setOccupiedTaxiData(data))
      .catch(() => setOccupiedTaxiData([]))
      .finally(() => setOccupiedTaxiLoading(false))
  }, [interval, date])

  useEffect(() => {
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
    ];
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

  const statOption = {
    title: { text: `${interval === '15min' ? '15分钟' : '1小时'}乘客数量分布`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: statData.map(item => {
        if (interval === '15min') {
          return item.interval_start.slice(8, 10) + ':' + item.interval_start.slice(10, 12)
        } else {
          return item.interval_start.slice(8, 10) + ':00'
        }
      }),
      name: '时间',
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', name: '乘客数量' },
    series: [
      {
        data: statData.map(item => item.count),
        type: 'line',
        smooth: true,
        areaStyle: {},
        name: '乘客数'
      }
    ]
  }

  const pieOption = distanceData ? {
    title: {
      text: '路程分析',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}单 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: [
        '短途（<4000米）',
        '中途（4000-8000米）',
        '长途（>8000米）'
      ]
    },
    series: [
      {
        name: '运输距离',
        type: 'pie',
        radius: '60%',
        data: [
          {
            value: distanceData.short_distance.count,
            name: '短途（<4000米）'
          },
          {
            value: distanceData.medium_distance.count,
            name: '中途（4000-8000米）'
          },
          {
            value: distanceData.long_distance.count,
            name: '长途（>8000米）'
          }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        label: {
          formatter: '{b}: {d}%'
        }
      }
    ]
  } : null

  // occupiedTaxiOption 需要放在组件函数体内，且依赖于 occupiedTaxiData 和 interval
  const occupiedTaxiOption = {
    title: { text: `${interval === '15min' ? '15分钟' : '1小时'}载客车数量分布`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: occupiedTaxiData.map((item: any) => {
        if (interval === '15min') {
          return item.interval_start.slice(8, 10) + ':' + item.interval_start.slice(10, 12)
        } else {
          return item.interval_start.slice(8, 10) + ':00'
        }
      }),
      name: '时间',
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', name: '载客车数量' },
    series: [
      {
        data: occupiedTaxiData.map((item: any) => item.occupied_taxi_count),
        type: 'line',
        smooth: true,
        areaStyle: {},
        name: '载客车数'
      }
    ]
  }

  return (
    <>
      <Flex align="center" gap={4} mb={2}>
        <Field label="选择日期">
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            height={8}
            borderRadius={4}
            border="1px solid #ccc"
            px={2}
            w={40}
          />
        </Field>
        <Field label="时间间隔">
          <RadioGroup value={interval} onValueChange={e => setInterval(e.value as '15min' | '1h')} direction="row">
            <Radio value="15min">15分钟</Radio>
            <Radio value="1h">1小时</Radio>
          </RadioGroup>
        </Field>
        <Field label="图表类型">
          <RadioGroup value={chartType} onValueChange={e => setChartType(e.value as 'passenger' | 'taxi')} direction="row">
            <Radio value="passenger">乘车人数分布</Radio>
            <Radio value="taxi">载客车辆分布</Radio>
          </RadioGroup>
        </Field>
      </Flex>
      {/* 图表展示区 */}
      {chartType === 'passenger' ? (
        <>
          <Text mb={2} color="gray.500">下方为{interval === '15min' ? '15分钟' : '1小时'}乘客数量分布图：</Text>
          {loading ? (
            <Text mt={4}>加载中...</Text>
          ) : (
            <ReactECharts style={{height: 400}} option={statOption} notMerge={true} lazyUpdate={true} />
          )}
        </>
      ) : (
        <>
          <Text mb={2} color="gray.500">下方为{interval === '15min' ? '15分钟' : '1小时'}载客车辆分布图：</Text>
          {occupiedTaxiLoading ? (
            <Text mt={4}>加载中...</Text>
          ) : (
            <ReactECharts style={{height: 400}} option={occupiedTaxiOption} notMerge={true} lazyUpdate={true} />
          )}
        </>
      )}
      {/* 路程分析饼图展示，放在地图上方 */}
      <Text mt={8} mb={2} fontWeight="bold">路程分析：</Text>
      {date && distanceData && pieOption ? (
        <ReactECharts style={{height: 400}} option={pieOption} notMerge={true} lazyUpdate={true} />
      ) : (
        <Text>请选择日期后查看路程分析</Text>
      )}
      {/* 新增济南市地图展示 */}
      <Text mt={8} mb={2} fontWeight="bold">济南市地图：</Text>
      {mapLoaded && mapOption ? (
        <ReactECharts style={{height: 500}} option={mapOption} notMerge={true} lazyUpdate={true} />
      ) : (
        <Text>地图加载中...</Text>
      )}
    </>
  )
} 