locals {
  region = "us-east-1"
  instance_type = "t3.medium"
}

resource "aws_instance" "example" {
  ami           = "ami-12345678"
  instance_type = local.instance_type
  availability_zone = "${local.region}a"
}

