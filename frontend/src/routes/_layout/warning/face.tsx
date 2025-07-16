import { Box, Container, Heading, Text } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/warning/face")({
  component: FaceWarningPage,
});

function FaceWarningPage() {
  return (
    <Container maxW="full">
      <Box pt={12} m={4} textAlign="center">
        <Heading size="lg" mb={4}>人脸检测告警</Heading>
        <Text fontSize="xl">这是人脸检测告警</Text>
      </Box>
    </Container>
  );
} 