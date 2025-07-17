import React from "react";
import { Box, Container, Heading, Table, Link, Button, Spinner, Input, Stack } from "@chakra-ui/react";
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/warning/road")({
  component: RoadWarningPage,
});

function RoadWarningPage() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  // 新增筛选条件
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [status, setStatus] = React.useState("all"); // all/processed/unprocessed
  const [searchId, setSearchId] = React.useState(""); // 新增ID搜索

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/logger/road-surface-detection");
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  // 前端筛选逻辑
  const filteredData = data.filter((row) => {
    // ID模糊搜索
    if (searchId && !String(row.id).includes(searchId.trim())) return false;
    // 处理状态筛选
    if (status === "processed" && !row.alarm_status) return false;
    if (status === "unprocessed" && row.alarm_status) return false;
    // 日期筛选
    if (startDate) {
      const rowDate = row.detection_time ? new Date(row.detection_time) : null;
      if (rowDate && rowDate < new Date(startDate)) return false;
    }
    if (endDate) {
      const rowDate = row.detection_time ? new Date(row.detection_time) : null;
      if (rowDate && rowDate > new Date(endDate + 'T23:59:59')) return false;
    }
    return true;
  });

  return (
    <Container maxW="full">
      <Box pt={12} m={4} textAlign="center">
        <Heading size="lg" mb={4}>路面检测告警</Heading>
      </Box>
      {/* 筛选栏优化对齐 */}
      <Box mb={4}>
        <Stack direction="row" gap={8} align="flex-end">
          <Stack direction="column" gap={1} align="flex-start">
            <Box minW="80px" textAlign="right">按ID搜索：</Box>
            <Input type="text" value={searchId} onChange={e => setSearchId(e.target.value)} size="sm" maxW="120px" placeholder="输入ID" />
          </Stack>
          <Stack direction="column" gap={1} align="flex-start">
            <Box minW="80px" textAlign="right">开始日期：</Box>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} size="sm" maxW="180px" />
          </Stack>
          <Stack direction="column" gap={1} align="flex-start">
            <Box minW="80px" textAlign="right">结束日期：</Box>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} size="sm" maxW="180px" />
          </Stack>
          <Stack direction="column" gap={1} align="flex-start">
            <Box minW="80px" textAlign="right">处理状态：</Box>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ height: 32, borderRadius: 4, border: '1px solid #ccc', padding: '0 8px', fontSize: 14, minWidth: 80 }}>
              <option value="all">全部</option>
              <option value="processed">已处理</option>
              <option value="unprocessed">未处理</option>
            </select>
          </Stack>
        </Stack>
      </Box>
      <Button onClick={fetchData} mb={4} loading={loading} colorScheme="blue">刷新</Button>
      <Table.Root size={{ base: "sm", md: "md" }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="sm">病害路面id</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">原始视频/图片</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">检测时间</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">是否已处理</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {loading ? (
            <Table.Row>
              <Table.Cell colSpan={4} textAlign="center">
                <Spinner size="md" />
              </Table.Cell>
            </Table.Row>
          ) : filteredData.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4} textAlign="center">暂无数据</Table.Cell>
            </Table.Row>
          ) : (
            filteredData.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{row.id}</Table.Cell>
                <Table.Cell>
                  {row.file_type.startsWith('mp4') ? (
                    <video controls style={{ maxWidth: 200, maxHeight: 120 }}>
                      <source src={`data:video/${row.file_type};base64,${row.file_data}`} type={`video/${row.file_type}`} />
                      您的浏览器不支持视频播放。
                    </video>
                  ) : (
                    <img
                      src={`data:image/${row.file_type};base64,${row.file_data}`}
                      alt="预览"
                      style={{ maxWidth: 200, maxHeight: 120 }}
                    />
                  )}
                </Table.Cell>
                <Table.Cell>
                  {row.detection_time
                    ? new Date(row.detection_time).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      }).replace(/\//g, '-')
                    : ''}
                </Table.Cell>
                <Table.Cell>{row.alarm_status ? "已处理" : (
                  <>
                    未处理
                    <RouterLink
                      to={`/repair?id=${row.id}`}
                      style={{ marginLeft: 8 }}
                    >
                      <Button size="sm" colorScheme="blue">
                        去处理
                      </Button>
                    </RouterLink>
                  </>
                )}
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </Container>
  );
}
