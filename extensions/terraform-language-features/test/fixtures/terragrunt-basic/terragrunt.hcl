include {
  path = find_in_parent_folders()
}

locals {
  instance_type = local.env_vars.instance_type
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
  instance_type = local.instance_type
}

