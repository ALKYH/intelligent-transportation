from fastapi import APIRouter, UploadFile, File, Form
from app.faceRecognition.HumanFace import FaceVerificationSystem

router = APIRouter(prefix="/face-recognition", tags=["face-recognition"])
face_system = FaceVerificationSystem()

@router.post("/verify-face")
def verify_face(file: UploadFile = File(...)):
    """验证上传的人脸图片"""
    try:
        contents = file.file.read()
        # 将字节数据转换为 OpenCV 图像
        import cv2
        import numpy as np
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        result = face_system.verify_face(image)
        if result.get('status') == 'failure' and result.get('exception') == 'Not a Registered User':
            face_system.record_unauthorized_user_database(image)
        return result
    except Exception as e:
        face_system.record_malicious_attack_database(str(e))
        return {"status": "failure", "exception": str(e)}

@router.post("/register-face")
def register_face(username: str = Form(...), file: UploadFile = File(...)):
    """注册新用户人脸"""
    try:
        # 新增：注册前先检查用户名是否已存在
        if face_system.check_username_exists(username):
            return {"status": "failure", "exception": "用户名已存在"}
        contents = file.file.read()
        import cv2
        import numpy as np
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        # 活体检测
        if not face_system.live_detection(image):
            return {"status": "failure", "exception": "活体检测未通过"}
        # 检测人脸区域
        face_region, _ = face_system.detect_face(image)
        if face_region is None:
            return {"status": "failure", "exception": "未检测到人脸"}
        # 注册到数据库
        face_system.register_user_database(username, face_region)
        face_system.load_user_faces_database()
        return {"status": "success", "message": f"用户 {username} 注册成功"}
    except Exception as e:
        return {"status": "failure", "exception": str(e)}

@router.post("/record-malicious-attack")
def record_malicious_attack(attack_info: str = Form(...), file: UploadFile = File(...)):
    """记录恶意攻击信息"""
    try:
        contents = file.file.read()
        import cv2
        import numpy as np
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        # 检测人脸区域
        face_region, _ = face_system.detect_face(image)
        if face_region is None:
            return {"status": "failure", "exception": "未检测到人脸"}

        face_system.record_malicious_attack_database(attack_info, face_region)
        return {"status": "success", "message": "恶意攻击信息记录成功"}
    except Exception as e:
        return {"status": "failure", "exception": str(e)}

@router.get("/check-username")
def check_username(username: str):
    """检查用户名是否已存在"""
    try:
        print(f"API: 检查用户名 {username}")
        exists = face_system.check_username_exists(username)
        print(f"API: 用户名 {username} 存在: {exists}")
        return {"exists": exists}
    except Exception as e:
        print(f"API: 检查用户名失败: {e}")
        return {"status": "failure", "exception": str(e)}

@router.post("/check-face")
def check_face(file: UploadFile = File(...)):
    """检查人脸是否已存在"""
    try:
        print("API: 开始检查人脸")
        contents = file.file.read()
        import cv2
        import numpy as np
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        # 活体检测
        if not face_system.live_detection(image):
            return {"status": "failure", "exception": "活体检测未通过"}
        # 检测人脸区域
        face_region, _ = face_system.detect_face(image)
        if face_region is None:
            print("API: 未检测到人脸")
            return {"status": "failure", "exception": "未检测到人脸"}
        exists = face_system.check_face_exists(face_region)
        print(f"API: 人脸存在: {exists}")
        return {"exists": exists}
    except Exception as e:
        print(f"API: 检查人脸失败: {e}")
        return {"status": "failure", "exception": str(e)}

@router.get("/unauthorized-users", response_model=list)
def read_all_unauthorized_users():
    results = face_system.get_unauthorized_users()
    return results