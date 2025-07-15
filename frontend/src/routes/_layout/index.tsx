import { Box, Container, Text, Stack } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <>
      <Container maxW="full">
        <Box pt={12} m={4}>
          <Text fontSize="2xl" truncate maxW="sm">
            你好, {currentUser?.full_name || currentUser?.email} 👋🏼
          </Text>
          <Text>欢迎回来，很高兴再次见到你！</Text>
        </Box>
        <Stack direction={{ base: "column", md: "row" }} gap={6} mt={8}>
        </Stack>
      </Container>
    </>
  )
}
