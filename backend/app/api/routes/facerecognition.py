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
        contents = file.file.read()
        import cv2
        import numpy as np
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
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
def record_malicious_attack(attack_info: str = Form(...)):
    """记录恶意攻击信息"""
    try:
        face_system.record_malicious_attack_database(attack_info)
        return {"status": "success", "message": "恶意攻击信息记录成功"}
    except Exception as e:
        return {"status": "failure", "exception": str(e)}