import { useEffect, useState } from "react"
import ReactECharts from 'echarts-for-react'
import { Text, Flex, Input } from "@chakra-ui/react"
import { Field } from '../ui/field'
import { RadioGroup, Radio } from '../ui/radio'
import { Button } from '../ui/button'
import { MenuRoot, MenuTrigger, MenuContent, MenuRadioItemGroup, MenuRadioItem } from '../ui/menu'

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
  const [timeLabels, setTimeLabels] = useState<string[]>([])
  const [selectedChart, setSelectedChart] = useState<'passenger' | 'taxi' | 'distance' | 'speed'>('passenger')
  const [weatherData, setWeatherData] = useState<any[]>([])
  const [speedData, setSpeedData] = useState<any[]>([])
  const [speedLoading, setSpeedLoading] = useState(false)

  useEffect(() => {
    const labels: string[] = []
    if (interval === '1h') {
      for (let i = 0; i < 24; i++) {
        labels.push(`${String(i).padStart(2, '0')}:00`)
      }
    } else { // 15min
      for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 60; j += 15) {
          labels.push(`${String(i).padStart(2, '0')}:${String(j).padStart(2, '0')}`)
        }
      }
    }
    setTimeLabels(labels)
  }, [interval])

  useEffect(() => {
    setLoading(true)
    fetch(`http://localhost:8000/api/v1/analysis/passenger-count-distribution?interval=${interval}&date=${formatDateParam(date)}`)
      .then(res => res.json())
      .then(data => setStatData(data))
      .catch(() => setStatData([]))
      .finally(() => setLoading(false))
  }, [interval, date])

  useEffect(() => {
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
    if (!date) return
    fetch(`http://localhost:8000/api/v1/analysis/weather-info?date=${date}`)
      .then(res => res.json())
      .then(data => setWeatherData(data.weather || []))
      .catch(() => setWeatherData([]))
  }, [date])

  useEffect(() => {
    setSpeedLoading(true)
    fetch(`http://localhost:8000/api/v1/analysis/time-interval-stats?interval=${interval}&date=${formatDateParam(date)}`)
      .then(res => res.json())
      .then(data => setSpeedData(data))
      .catch(() => setSpeedData([]))
      .finally(() => setSpeedLoading(false))
  }, [interval, date])

  const hourLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  // 获取小时部分
  const getHour = (str: string) => str.slice(11, 13)
  const temperatureSeries = (interval === '1h' ? hourLabels : timeLabels).map(label => {
    const hour = label.slice(0, 2)
    const item = weatherData.find(w => getHour(w.Time_new) === hour)
    return item ? item.Temperature : null
  })

  const statOption = {
    title: { text: '乘客数量与温度', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['乘客数', '温度'], bottom: 0 },
    xAxis: {
      type: 'category',
      data: interval === '1h' ? hourLabels : timeLabels,
      name: '时间',
      axisLabel: { rotate: 45 }
    },
    yAxis: [
      { type: 'value', name: '乘客数量' },
      { type: 'value', name: '温度(℃)', position: 'right' }
    ],
    series: [
      {
        name: '乘客数',
        type: 'line',
        data: (interval === '1h' ? hourLabels : timeLabels).map(label => {
          const item = statData.find(d => {
            const itemLabel = interval === '15min'
              ? d.interval_start.slice(8, 10) + ':' + d.interval_start.slice(10, 12)
              : d.interval_start.slice(8, 10) + ':00'
            return itemLabel === label
          })
          return item ? item.count : null
        }),
        yAxisIndex: 0,
        smooth: true,
        areaStyle: {},
      },
      {
        name: '温度',
        type: 'line',
        data: temperatureSeries,
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        lineStyle: { color: '#f39c12' },
        itemStyle: { color: '#f39c12' },
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
    title: { text: '载客车数量与温度', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['载客车数', '温度'], bottom: 0 },
    xAxis: {
      type: 'category',
      data: interval === '1h' ? hourLabels : timeLabels,
      name: '时间',
      axisLabel: { rotate: 45 }
    },
    yAxis: [
      { type: 'value', name: '载客车数量' },
      { type: 'value', name: '温度(℃)', position: 'right' }
    ],
    series: [
      {
        name: '载客车数',
        type: 'line',
        data: (interval === '1h' ? hourLabels : timeLabels).map(label => {
          const item = occupiedTaxiData.find((d: any) => {
            const itemLabel = interval === '15min'
              ? d.interval_start.slice(8, 10) + ':' + d.interval_start.slice(10, 12)
              : d.interval_start.slice(8, 10) + ':00'
            return itemLabel === label
          })
          return item ? item.occupied_taxi_count : null
        }),
        yAxisIndex: 0,
        smooth: true,
        areaStyle: {},
      },
      {
        name: '温度',
        type: 'line',
        data: temperatureSeries,
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        lineStyle: { color: '#f39c12' },
        itemStyle: { color: '#f39c12' },
      }
    ]
  }

  const speedOption = {
    title: { text: '平均速度分布', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均速度'], bottom: 0 },
    xAxis: {
      type: 'category',
      data: interval === '1h' ? hourLabels : timeLabels,
      name: '时间',
      axisLabel: { rotate: 45 }
    },
    yAxis: [
      { type: 'value', name: '平均速度(km/h)' }
    ],
    series: [
      {
        name: '平均速度',
        type: 'line',
        data: (interval === '1h' ? hourLabels : timeLabels).map(label => {
          const item = speedData.find(d => {
            const itemLabel = interval === '15min'
              ? d.interval_start.slice(8, 10) + ':' + d.interval_start.slice(10, 12)
              : d.interval_start.slice(8, 10) + ':00'
            return itemLabel === label
          })
          return item ? item.avg_speed_kmh : null
        }),
        yAxisIndex: 0,
        smooth: true,
        areaStyle: {},
      }
    ]
  }

  return (
    <>
      <Flex align="center" gap={4} mb={2}>
        <Field label="选择图表">
          <MenuRoot>
            <MenuTrigger asChild>
              <Button variant="outline" minW={36}>
                {selectedChart === 'passenger' ? '乘客数量分布' :
                 selectedChart === 'taxi' ? '载客车辆分布' :
                 selectedChart === 'distance' ? '路程分析' : '平均速度分布'}
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioItemGroup value={selectedChart} onValueChange={(e) => setSelectedChart(e.value as 'passenger' | 'taxi' | 'distance' | 'speed')}>
                <MenuRadioItem value="passenger">乘客数量分布</MenuRadioItem>
                <MenuRadioItem value="taxi">载客车辆分布</MenuRadioItem>
                <MenuRadioItem value="distance">路程分析</MenuRadioItem>
                <MenuRadioItem value="speed">平均速度分布</MenuRadioItem>
              </MenuRadioItemGroup>
            </MenuContent>
          </MenuRoot>
        </Field>
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
        {['passenger', 'taxi', 'speed'].includes(selectedChart) && (
          <Field label="时间间隔">
            <RadioGroup 
              value={interval} 
              onValueChange={e => setInterval(e.value as '15min' | '1h')} 
              direction="row" 
              style={{ gap: 24 }} // 增大按钮间距
            >
              <Radio value="15min" style={{ height: 28, fontSize: 13, padding: '0 8px' }}>15分钟</Radio>
              <Radio value="1h" style={{ height: 28, fontSize: 13, padding: '0 8px' }}>1小时</Radio>
            </RadioGroup>
          </Field>
        )}
      </Flex>
      {/* 图表展示区 */}
      {selectedChart === 'passenger' && (
        <>
          <Text mb={2} color="gray.500">下方为{interval === '15min' ? '15分钟' : '1小时'}乘客数量与温度分布图：</Text>
          <ReactECharts style={{height: 400}} option={statOption} notMerge={true} lazyUpdate={true} />
        </>
      )}
      {selectedChart === 'taxi' && (
        <>
          <Text mb={2} color="gray.500">下方为{interval === '15min' ? '15分钟' : '1小时'}载客车辆与温度分布图：</Text>
          <ReactECharts style={{height: 400}} option={occupiedTaxiOption} notMerge={true} lazyUpdate={true} />
        </>
      )}
      {selectedChart === 'distance' && (
        <>
          <Text mb={2} fontWeight="bold">路程分析：</Text>
          {date && distanceData && pieOption ? (
            <ReactECharts style={{height: 400}} option={pieOption} notMerge={true} lazyUpdate={true} />
          ) : (
            <Text>请选择日期后查看路程分析</Text>
          )}
        </>
      )}
      {selectedChart === 'speed' && (
        <>
          <Text mb={2} color="gray.500">下方为{interval === '15min' ? '15分钟' : '1小时'}平均速度分布图：</Text>
          <ReactECharts style={{height: 400}} option={speedOption} notMerge={true} lazyUpdate={true} />
        </>
      )}
    </>
  )
} 