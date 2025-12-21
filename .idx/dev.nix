{ pkgs, ... }: {

  # Which nixpkgs channel to use.
  channel = "stable-23.11"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.nil
    pkgs.tailwindcss-language-server
  ];

  # Sets environment variables in the workspace for local development.
  # IMPORTANT: These secrets are visible in this file and your repository.
  # For better security, consider loading them from a .env file that is
  # not checked into git.
  env = {
    NODE_ENV = "development";
    DIESEL_API_USERNAME = "ENgsxyMbeqVGvGzTCpVdkZmsjz/VCDeF+NWHlRk3Hk0=";
    DIESEL_API_PASSWORD = "EuoTNvCvp5imhOR2TZDe/fnKDxfoPK+EORSqfGvafZk=";
    DIESEL_STORE_ID = "7b0fb2ac-51bd-47ea-847e-cfb1584b4aa2";
    HURLEY_API_USERNAME = "CtAAy94MhKTJClgAwEfQL9LfkM14CegkeUbpBfhwt68=";
    HURLEY_API_PASSWORD = "AmlbcKtg1WQsLuivLpjyOTVizNrijZiXY6vVJoT5a1U=";
    HURLEY_STORE_ID = "a504304c-ad27-4b9b-8625-92a314498e64";
    JEEP_APPAREL_API_USERNAME = "+w3K5hLq56MQ4ijqFH78lV0xQCTTzP9mNAqToCUL9Cw=";
    JEEP_APPAREL_API_PASSWORD = "l2+ozGqsA6PX7MSHrl4OMwZRTieKzUpJVWv/WYye8iA=";
    JEEP_APPAREL_STORE_ID = "80f123d6-f9de-45b9-938c-61c0a358f205";
    SUPERDRY_API_USERNAME = "zcUrzwFh2QwtH1yEJixFXtUA4XGQyx2wbNVLpYTzZ8M=";
    SUPERDRY_API_PASSWORD = "92Av8tHsbq2XLEZZeRwYNsPFSkca+dD1cwRQs79rooM=";
    SUPERDRY_STORE_ID = "b112948b-0390-4833-8f41-47f997c5382c";
  };

  # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
  idx.extensions = [
    # Example: "dbaeumer.vscode-eslint"
  ];

  # Enable previews and customize configuration
  idx.previews = {
    enable = true;
    previews = {
      web = {
        # The command to start your Next.js dev server.
        # This will be run in the terminal when you open the preview.
        command = [
          "npm"
          "run"
          "dev"
          "--"
          "--port"
          "$PORT"
          "--hostname"
          "0.0.0.0"
        ];
        manager = "web";
      };
    };
  };
}