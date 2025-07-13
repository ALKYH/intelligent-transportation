### 1. POST /verify-face 数据格式
此接口使用 multipart/form-data 格式，仅需上传人脸图片文件。
图片处理
客户端上传图片文件后，服务端会将文件内容读取为字节数据，再转换为 numpy 数组，最后使用 OpenCV 解码为图像。示例代码如下：

| 参数名 | 类型 | 说明         | 是否必填 |
| ------ | ---- | ------------ | -------- |
| file   | File | 人脸图片文件 | 是       |

```
contents = file.file.read()
nparr = np.frombuffer(contents, np.
uint8)
image = cv2.imdecode(nparr, cv2.
IMREAD_COLOR)
```
### 2. POST /register-face 数据格式
此接口同样使用 multipart/form-data 格式，需要提供用户名和人脸图片文件。
 请求参数

| 参数名   | 类型 | 说明           | 是否必填 |
| -------- | ---- | -------------- | -------- |
| username | Form | 新用户的用户名 | 是       |
| file     | File | 人脸图片文件   | 是       |

 图片处理
与 /verify-face 接口一致，服务端会将上传的图片文件转换为 OpenCV 图像，然后检测人脸区域并注册到数据库。

### 3. POST /record-malicious-attack 数据格式
使用 application/x-www-form-urlencoded 格式，仅需提供恶意攻击信息。
 请求参数

| 参数名      | 类型 | 说明               | 是否必填 |
| ----------- | ---- | ------------------ | -------- |
| attack_info | Form | 恶意攻击的相关信息 | 是       |


图片处理

此接口不涉及图片传输。

会用到的数据表脚本

``` sql
create table user_faces
(
    username   varchar(255) not null
        primary key
        unique,
    face_image bytea        not null,
    created_at timestamp default CURRENT_TIMESTAMP
);

create table unauthorized_users
(
    id          serial
        primary key,
    face_image  bytea not null,
    detected_at timestamp default CURRENT_TIMESTAMP
);

create table malicious_attacks
(
    id          serial
        primary key,
    attack_info text not null,
    detected_at timestamp default CURRENT_TIMESTAMP
);
```

