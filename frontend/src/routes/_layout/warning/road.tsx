import React from "react";
import { Box, Container, Heading, Table, Link, Button, Spinner } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/warning/road")({
  component: RoadWarningPage,
});

function RoadWarningPage() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/logger/road-surface-detection");
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

  return (
    <Container maxW="full">
      <Box pt={12} m={4} textAlign="center">
        <Heading size="lg" mb={4}>路面检测告警</Heading>
      </Box>
      <Button onClick={fetchData} mb={4} loading={loading} colorScheme="blue">刷新</Button>
      <Table.Root size={{ base: "sm", md: "md" }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="sm">检测结构ID</Table.ColumnHeader>
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
          ) : data.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4} textAlign="center">暂无数据</Table.Cell>
            </Table.Row>
          ) : (
            data.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{row.id}</Table.Cell>
                <Table.Cell>
                  <Link
                    href={`data:${row.file_type.startsWith('mp4') ? 'video' : 'image'}/${row.file_type};base64,${row.file_data}`}
                    download={`下载.${row.file_type}`}
                    color="blue.500"
                    textDecoration="underline"
                    fontSize="md"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    下载链接
                  </Link>
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
                <Table.Cell>{row.alarm_status ? "已处理" : "未处理"}</Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </Container>
  );
}
