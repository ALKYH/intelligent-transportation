"use client"

import { toaster } from "@/components/ui/toaster"

const useCustomToast = () => {
  const showSuccessToast = (description: string) => {
    toaster.create({
      title: "操作成功！",
      description,
      type: "success",
    })
  }

  const showErrorToast = (description: string) => {
    let desc = description
    if (desc === "New password cannot be the same as the current one") {
      desc = "新密码不能与当前密码相同"
    }
    if (desc === "Incorrect password") {
      desc = "原密码错误"
    }
    if (desc === "Incorrect email or password") {
      desc = "邮箱或密码错误"
    }
    if (desc === "Email already registered") {
      desc = "该邮箱已被注册"
    }
    toaster.create({
      title: "发生错误！",
      description: desc,
      type: "error",
    })
  }

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
