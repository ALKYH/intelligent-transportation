import React, { useState, useEffect } from "react";
import { Box, Button, Container, Heading, Spinner, Link, Table } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";

const TABS = [
  { key: "unauth", label: "非验证用户信息" },
  { key: "malicious", label: "攻击信息" },
];

function downloadTxt(info: string, idx: number) {
  const blob = new Blob([info], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `攻击信息_${idx + 1}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function FaceWarningPage() {
  const [tab, setTab] = useState("unauth");
  const [unauthData, setUnauthData] = useState<any[]>([]);
  const [maliciousData, setMaliciousData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (tab === "unauth") {
      fetch("http://localhost:8000/api/v1/face-recognition/unauthorized-users")
        .then(res => res.json())
        .then(setUnauthData)
        .finally(() => setLoading(false));
    } else {
      fetch("http://localhost:8000/api/v1/logger/malicious-attack")
        .then(res => res.json())
        .then(setMaliciousData)
        .finally(() => setLoading(false));
    }
  }, [tab]);

  return (
    <Container maxW="full">
      <Box pt={12} m={4} textAlign="center">
        <Heading size="lg" mb={4}>人脸检测告警</Heading>
      </Box>
      <Box display="flex" mb={4}>
        {TABS.map(t => (
          <Button
            key={t.key}
            onClick={() => setTab(t.key)}
            variant={tab === t.key ? "solid" : "ghost"}
            mr={2}
          >
            {t.label}
          </Button>
        ))}
      </Box>
      {loading ? <Spinner /> : (
        tab === "unauth" ? (
          <Table.Root size={{ base: "sm", md: "md" }}>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader w="sm">序号</Table.ColumnHeader>
                <Table.ColumnHeader w="sm">非认证用户识别图片</Table.ColumnHeader>
                <Table.ColumnHeader w="sm">日期</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {unauthData.map((row, idx) => (
                <Table.Row key={row.id || idx}>
                  <Table.Cell>{idx + 1}</Table.Cell>
                  <Table.Cell>
                    <img src={`data:image/jpeg;base64,${row.face_image}`} alt="预览" style={{ maxWidth: 120 }} />
                  </Table.Cell>
                  <Table.Cell>{row.detected_at || row.date || row.created_at}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Table.Root size={{ base: "sm", md: "md" }}>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader w="sm">序号</Table.ColumnHeader>
                <Table.ColumnHeader w="sm">攻击信息</Table.ColumnHeader>
                <Table.ColumnHeader w="sm">攻击时间</Table.ColumnHeader>
                <Table.ColumnHeader w="sm">人脸照片</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {maliciousData.map((row, idx) => (
                <Table.Row key={row.id || idx}>
                  <Table.Cell>{idx + 1}</Table.Cell>
                  <Table.Cell>
                    <Link onClick={() => downloadTxt(row.attack_info, idx)} style={{ cursor: "pointer" }}>信息</Link>
                  </Table.Cell>
                  <Table.Cell>{row.attack_time || row.created_at || row.date}</Table.Cell>
                  <Table.Cell>
                    <img src={`data:image/jpeg;base64,${row.face_image}`} alt="预览" style={{ maxWidth: 120 }} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )
      )}
    </Container>
  );
}

export const Route = createFileRoute("/_layout/warning/face")({
  component: FaceWarningPage,
}); 