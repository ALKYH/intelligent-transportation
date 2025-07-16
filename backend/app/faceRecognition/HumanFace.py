import base64
import json

import cv2
import numpy as np
import psycopg2
import requests
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from psycopg2 import sql
from sympy import false
from ultralytics import YOLO
import os
import face_recognition
from face_recognition import compare_faces, face_distance
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# 人脸识别相关配置
FACE_RECOGNITION_DB_NAME: str = "app"  # 人脸识别数据库名
FACE_RECOGNITION_DB_USER: str = "postgres"  # 数据库用户名
FACE_RECOGNITION_DB_PASSWORD: str = "111"  # 数据库密码
FACE_RECOGNITION_DB_HOST: str = "113.47.146.57"  # 数据库主机地址
FACE_RECOGNITION_DB_PORT: int = 5432  # 数据库端口
FACE_RECOGNITION_BAIDU_API_AK: str = "ljtg9cD9vyKglyTstICBvkYd"
FACE_RECOGNITION_BAIDU_API_SK: str = "hiIblcdunkv7e7fQeAf9V0LDXjTaDcWA"

# 生成 AES 密钥
def generate_aes_key():
    return get_random_bytes(16)  # AES-128 使用 16 字节密钥

# 加密数据
def encrypt_data(data, key):
    cipher = AES.new(key, AES.MODE_EAX)
    nonce = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)
    return nonce + tag + ciphertext

# 解密数据
def decrypt_data(encrypted_data, key):
    nonce = encrypted_data[:16]
    tag = encrypted_data[16:32]
    ciphertext = encrypted_data[32:]
    cipher = AES.new(key, AES.MODE_EAX, nonce=nonce)
    try:
        decrypted_data = cipher.decrypt_and_verify(ciphertext, tag)
        return decrypted_data
    except ValueError:
        print("解密失败：数据可能被篡改或密钥不正确。")
        return None

class FaceVerificationSystem:
    def __init__(self, model_path="yolov11l-face.pt", feature_threshold=0.6):
        # 获取当前文件所在目录
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # 拼接模型的绝对路径
        absolute_model_path = os.path.join(current_dir, model_path)
        
        # 检查模型文件是否存在，如果不存在则使用默认的 YOLO 模型
        if os.path.exists(absolute_model_path):
            # 初始化YOLO人脸检测模型
            self.model = YOLO(absolute_model_path)
        else:
            print(f"模型文件 {absolute_model_path} 不存在，使用默认的 YOLO 模型")
            # 使用默认的 YOLO 模型，它会自动下载
            self.model = YOLO("yolov8n.pt")
        
        # 特征对比阈值（可调整）
        self.feature_threshold = feature_threshold
        # 存储用户特征库（用户名: [特征向量, 人脸图像]）
        self.user_feature_db = {}

        # 初始化数据库连接
        try:
            self.conn = psycopg2.connect(
                dbname=FACE_RECOGNITION_DB_NAME,
                user=FACE_RECOGNITION_DB_USER,
                password=FACE_RECOGNITION_DB_PASSWORD,
                host=FACE_RECOGNITION_DB_HOST,
                port=FACE_RECOGNITION_DB_PORT
            )
        except Exception as e:
            print(f"数据库连接失败: {e}")
            self.conn = None

        # 生成或加载 AES 密钥
        if not os.path.exists('aes_key.bin'):
            self.aes_key = generate_aes_key()
            with open('aes_key.bin', 'wb') as f:
                f.write(self.aes_key)
        else:
            with open('aes_key.bin', 'rb') as f:
                self.aes_key = f.read()
        
        if self.conn:
            self.load_user_faces_database()
        # 记录非认证用户的文件夹
        # if not os.path.exists("unauthorized_users"):
        #    os.makedirs("unauthorized_users")
        # 百度APIkey配置
        self.ak = FACE_RECOGNITION_BAIDU_API_AK
        self.sk = FACE_RECOGNITION_BAIDU_API_SK

    def get_access_token(self):
        """获取百度 API 的 access_token"""
        url = "https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.ak,
            "client_secret": self.sk
        }
        response = requests.post(url, params=params)
        print("access token: " + response.json().get("access_token"))
        return response.json().get("access_token")

    def execute_query(self, query, params=None):
        """执行 SQL 查询"""
        if not self.conn:
            print("数据库未连接，无法执行查询")
            return None
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query, params)
                self.conn.commit()
                if isinstance(query, str) and query.strip().upper().startswith("SELECT"):
                    return cursor.fetchall()
                return None
        except Exception as e:
            print(f"数据库操作出错: {e}")
            self.conn.rollback()
            return None

    def register_user_database(self, username, face_image):
        """注册新用户到数据库，存储人脸图片"""
        try:
            if isinstance(face_image, np.ndarray):
                _, img_encoded = cv2.imencode('.jpg', face_image)
                img_bytes = img_encoded.tobytes()
                base64_image = base64.b64encode(img_bytes)
                encrypted_image = encrypt_data(base64_image, self.aes_key)
                query = sql.SQL("INSERT INTO user_faces (username, face_image) VALUES (%s, %s)")
                result = self.execute_query(query, (username, encrypted_image))
                
                # 同时更新内存中的特征库
                features = self.extract_features(face_image)
                if features is not None:
                    self.user_feature_db[username] = {"features": features, "timestamp": datetime.now()}
                
                return True
            else:
                print("输入的人脸图片格式不正确，应为 numpy.ndarray 类型")
                return False
        except Exception as e:
            print(f"注册用户到数据库失败: {e}")
            return False

    def load_user_faces_database(self):
        """从数据库加载用户人脸图片并现场提取特征"""
        try:
            query = "SELECT username, face_image FROM user_faces"
            results = self.execute_query(query)
            if results:
                for username, image_data in results:
                    try:
                        decrypted_data = decrypt_data(image_data, self.aes_key)
                        if decrypted_data:
                            base64_image = decrypted_data
                            img_bytes = base64.b64decode(base64_image)
                            nparr = np.frombuffer(img_bytes, np.uint8)
                            face_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                            features = self.extract_features(face_image)
                            if features is not None:
                                self.user_feature_db[username] = {"features": features, "timestamp": datetime.now()}
                    except Exception as e:
                        print(f"加载用户 {username} 的人脸图片并提取特征失败: {e}")
            else:
                print("数据库中没有找到用户人脸数据")
        except Exception as e:
            print(f"加载用户人脸数据库失败: {e}")

    def record_unauthorized_user_database(self, face_image):
        """记录未授权用户"""
        if not isinstance(face_image, bytes):
            face_image = str(face_image).encode('utf-8')
        base64_image = base64.b64encode(face_image)
        encrypted_image = encrypt_data(base64_image, self.aes_key)
        query = "INSERT INTO unauthorized_users (face_image) VALUES (%s)"
        self.execute_query(query, (encrypted_image,))


    def record_malicious_attack_database(self, attack_info):
        """记录恶意攻击"""
        query = "INSERT INTO malicious_attacks (attack_info) VALUES (%s)"
        self.execute_query(query, (attack_info,))

    def check_username_exists(self, username):
        """检查用户名是否已存在"""
        try:
            print(f"正在检查用户名: {username}")
            query = "SELECT COUNT(*) FROM user_faces WHERE username = %s"
            result = self.execute_query(query, (username,))
            print(f"数据库查询结果: {result}")
            if result and len(result) > 0:
                count = result[0][0]
                print(f"用户名 {username} 的计数: {count}")
                return count > 0
            return False
        except Exception as e:
            print(f"检查用户名失败: {e}")
            return False

    def check_face_exists(self, face_image):
        """检查人脸是否已存在（通过特征对比）"""
        try:
            print("正在检查人脸是否已存在...")
            features = self.extract_features(face_image)
            if features is None:
                print("无法提取人脸特征")
                return False

            # 对比特征库
            if self.user_feature_db and len(self.user_feature_db) > 0:
                print(f"当前用户库中有 {len(self.user_feature_db)} 个用户")
                known_encodings = [data["features"] for data in self.user_feature_db.values() if data.get("features") is not None]
                if known_encodings:
                    face_distances = face_distance(known_encodings, features)
                    # 如果最小距离小于阈值，说明人脸已存在
                    min_distance = np.min(face_distances) if len(face_distances) > 0 else float('inf')
                    print(f"最小距离: {min_distance}, 阈值: {self.feature_threshold}")
                    result = min_distance < self.feature_threshold
                    print(f"人脸已存在: {result}")
                    return result
            else:
                print("用户库为空")
            return False
        except Exception as e:
            print(f"检查人脸失败: {e}")
            return False

    def load_user_faces_local(self):
        if os.path.exists("user_faces"):
            for filename in os.listdir("user_faces"):
                # 修改判断条件，处理以 .enc 结尾的文件
                if filename.endswith(".enc"):
                    username = os.path.splitext(os.path.splitext(filename)[0])[0]
                    encrypted_image_path = os.path.join("user_faces", filename)
                    if os.path.exists(encrypted_image_path):
                        with open(encrypted_image_path, 'rb') as f:
                            encrypted_image = f.read()
                        decrypted_image = decrypt_data(encrypted_image, self.aes_key)
                        if decrypted_image is not None:
                            nparr = np.frombuffer(decrypted_image, np.uint8)
                            face_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                            features = self.extract_features(face_image)
                            if features is not None:
                                self.user_feature_db[username] = {"features": features, "timestamp": datetime.now()}

    def preprocess_image(self, image):
        """对收到的图片进行图像归一化、人脸区域提取和人脸对齐等处理"""
        if image is None:
            return None

        # 图像归一化
        normalized_image = cv2.normalize(image, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)

        # 使用YOLO检测人脸区域
        face_region, box = self.detect_face(normalized_image)

        if face_region is None or box is None:
            print("未检测到人脸")
            return None

        left, top, right, bottom = box

        # 确保坐标为整数类型
        left = int(left)
        top = int(top)
        right = int(right)
        bottom = int(bottom)

        # 转换为RGB格式（face_recognition使用RGB）
        rgb_face = cv2.cvtColor(face_region, cv2.COLOR_BGR2RGB)

        # 检测人脸特征点（使用face_recognition，仅需特征点）
        face_landmarks = face_recognition.face_landmarks(rgb_face)

        if not face_landmarks:
            print("未检测到人脸特征点")
            return None

        # 假设只处理第一张人脸
        landmarks = face_landmarks[0]

        # 人脸对齐（使用特征点）
        left_eye = landmarks['left_eye']
        right_eye = landmarks['right_eye']

        # 计算双眼中心（相对于人脸区域）
        left_eye_center = np.mean(left_eye, axis=0).astype(int)
        right_eye_center = np.mean(right_eye, axis=0).astype(int)

        # 计算旋转角度
        dy = right_eye_center[1] - left_eye_center[1]
        dx = right_eye_center[0] - left_eye_center[0]
        angle = np.degrees(np.arctan2(dy, dx))

        # 计算旋转中心（人脸区域中心）
        center = ((left + right) // 2, (top + bottom) // 2)

        # 旋转矩阵
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

        # 应用旋转到原图
        aligned_image = cv2.warpAffine(
            normalized_image,
            rotation_matrix,
            (normalized_image.shape[1], normalized_image.shape[0])
        )

        # 使用YOLO重新检测对齐后的人脸区域
        aligned_face, aligned_box = self.detect_face(aligned_image)

        if aligned_face is None or aligned_box is None:
            print("对齐后未能检测到人脸")
            return None

        return aligned_face

    def detect_face(self, image):
        """使用YOLO检测人脸并返回人脸区域"""
        try:
            results = self.model(image, classes=[0])  # 假设0为face类别
            if results and len(results) > 0 and results[0] and hasattr(results[0], 'boxes') and results[0].boxes:
                # 取第一个检测到的人脸（可扩展多人脸处理）
                box = results[0].boxes.xyxy[0].cpu().numpy().astype(int)
                face_region = image[box[1]:box[3], box[0]:box[2]]
                return face_region, box
            return None, None
        except Exception as e:
            print(f"人脸检测出错: {e}")
            return None, None

    def extract_features(self, face_image):
        if face_image is None:
            return None
        rgb_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb_image)
        return encodings[0] if encodings else None

    def register_user_local(self, username, face_image):
        """录入新用户人脸"""
        # 检测人脸区域
        face_region, _ = self.detect_face(face_image)
        if face_region is None:
            return False

        features = self.extract_features(face_region)
        if features is not None:
            _, img_encoded = cv2.imencode('.jpg', face_region)
            img_bytes = img_encoded.tobytes()
            encrypted_image = encrypt_data(img_bytes, self.aes_key)
            with open(f"user_faces/{username}.jpg.enc", 'wb') as f:
                f.write(encrypted_image)
            self.user_feature_db[username] = {"features": features, "timestamp": datetime.now()}
            return True
        return False

    def save_unauthorized_face_local(self, face_image):
        """录入非认证人脸图像到指定目录"""
        if face_image is not None:
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            filename = os.path.join("unauthorized_users", f"unauthorized_{timestamp}.jpg")
            cv2.imwrite(filename, face_image)
            print(f"非认证人脸图像已保存到 {filename}")
        else:
            print("未检测到人脸，无法保存。")

    def live_detection(self, face_image):
        """调用百度 API 进行活体检测"""
        try:
            # 将 np.ndarray 转换为 JPEG 格式的字节数据
            _, buffer = cv2.imencode('.jpg', face_image)
            # 将字节数据进行 base64 编码
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            url = f"https://aip.baidubce.com/rest/2.0/face/v3/faceverify?access_token={self.get_access_token()}"
            headers = {"Content-Type": "application/json"}
            # 修正请求数据格式，符合百度人脸验证 API 要求
            payload = json.dumps([
                {
                    "image": img_base64,
                    "image_type": "BASE64",
                }
            ],ensure_ascii=False)
            response = requests.request("POST", url, headers=headers, data=payload.encode("utf-8"))
            print(response.text)
            result = response.json()
            if result.get('error_code') == 0:
                return result['result']['face_list'][0]['face_probability'] > 0.8  # 假设置信度大于 0.8 为活体
        except Exception as e:
            print(f"活体检测出错: {e}")
        return False

    def verify_face(self, face_image):
        """验证人脸并分类：认证用户/非认证用户/待录入"""
        if face_image is None:
            return {"status" : "failure", "exception" : "No Detected Face"}

        # # 活体检测
        # if not self.live_detection(face_image):
        #     print("非活体检测结果，可能存在攻击行为")
        #     self.save_unauthorized_face(face_image)
        #     return {"status" : "failure", "exception" : "Live detection failed"}

        features = self.extract_features(face_image)
        if features is None:
            return {"status" : "failure", "exception" : "Can't Extract Features"}

        # 对比特征库
        best_match = None
        min_distance = float('inf')

        if self.user_feature_db and len(self.user_feature_db) > 0:
            try:
                known_encodings = [data["features"] for data in self.user_feature_db.values() if data.get("features") is not None]
                if known_encodings:
                    face_distances = face_distance(known_encodings, features)

                    # 找到最小距离及其索引
                    if len(face_distances) > 0:
                        best_match_index = np.argmin(face_distances)
                        min_distance = face_distances[best_match_index]  # 更新最小距离

                        # 使用 face_recognition 的 compare_faces 判断是否匹配
                        matches = compare_faces(known_encodings, features, tolerance=0.5)
                        if matches[best_match_index]:
                            best_match = list(self.user_feature_db.keys())[best_match_index]
            except Exception as e:
                print(f"特征对比出错: {e}")
                return {"status": "failure", "exception": f"特征对比失败: {str(e)}"}

        print(f"最小距离: {min_distance}, 阈值: {self.feature_threshold}")  # 新增
        # 分类逻辑
        if best_match and min_distance < self.feature_threshold:
            return {"status" : "success", "best_match" : best_match, "min_distance": float(min_distance)}
        elif len(self.user_feature_db) > 0:
            return {"status" : "failure", "exception" : "Not a Registered User", "min_distance": float(min_distance) if min_distance != float('inf') else None}
        else:
            return {"status" : "failure", "exception" : "Not a Registered User"}

    def run_live_demo(self, camera_id=0):
        """实时摄像头演示"""
        cap = cv2.VideoCapture(camera_id)
        if not cap.isOpened():
            print("无法打开摄像头")
            return

        while True:
            ret, frame = cap.read()
            if not ret:
                print("无法获取画面")
                break

            face, box = self.detect_face(frame)
            result= self.verify_face(face)

            print("result:", result)

            # 显示结果
            if box is not None:
                cv2.rectangle(frame, (box[0], box[1]), (box[2], box[3]), (0, 255, 0), 2)
                # 使用 PIL 绘制中文文字
                img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                draw = ImageDraw.Draw(img_pil)
                font = ImageFont.truetype("simhei.ttf", 16)  # 使用支持中文的字体，如 simhei.ttf
                text = f"{result.get('best_match', 'UNKNOWN')}"
                draw.text((box[0], box[1] - 20), text, font=font, fill=(0, 255, 0))
                frame = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

            cv2.imshow("Face Verification System", frame)
            key = cv2.waitKey(1)
            if key == ord('q'):  # 按q退出
                break
            elif key == ord('r') and result.get('best_match') is None:  # 按r注册新用户
                username = input("请输入用户名: ")
                if self.register_user_local(username, face):
                    print(f"用户 {username} 注册成功！")

        cap.release()
        cv2.destroyAllWindows()

    def verify_image(self, image):
        """验证传入的图片"""
        # image = cv2.imread(image_path) # This line was commented out in the original file

        if image is None:
            print("无法读取图片")
            return

        face = self.preprocess_image(image)
        result = self.verify_face(face)

        return result

    def __del__(self):
        """析构函数，确保数据库连接被正确关闭"""
        if hasattr(self, 'conn') and self.conn:
            self.conn.close()

# 示例用法
if __name__ == "__main__":

    system = FaceVerificationSystem()
    image_path = "ljz.png"
    image = cv2.imread(image_path)
    #imageFace,_ = system.detect_face(image)
    #imageFeature = system.extract_features(imageFace)
    #system.register_user_database("LJZ", imageFace)
    res = system.verify_image(image)
    print(res)